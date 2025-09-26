import OpenAI from "openai";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Database schema information for context (RAG approach)
const DATABASE_SCHEMA = {
  products: {
    description: "Main tire products table",
    columns: {
      id: "Primary key",
      make: "Vehicle manufacturer (e.g., Toyota, Honda, BMW)",
      model: "Vehicle model (e.g., Camry, Accord, X3)",
      year: "Vehicle year (e.g., 2020, 2021, 2022)",
      size: "Tire size (e.g., 225/65R17, P215/60R16)",
      brand: "Tire brand (e.g., Michelin, Bridgestone, Goodyear)",
      price: "Price per tire (decimal)",
      quantity: "Available stock quantity",
      description: "Product description",
      created_at: "Creation timestamp",
      updated_at: "Last update timestamp"
    },
    indexes: ["make", "model", "year", "size", "brand", "price"],
    sample_data: [
      "{ make: 'Toyota', model: 'Camry', year: '2020', size: '225/65R17', brand: 'Michelin', price: 150.00 }",
      "{ make: 'Honda', model: 'Accord', year: '2021', size: '235/45R18', brand: 'Bridgestone', price: 180.00 }"
    ]
  },
  company: {
    description: "Vehicle manufacturers lookup table",
    columns: {
      id: "Primary key",
      name: "Company/manufacturer name",
      created_at: "Creation timestamp"
    }
  }
};

// Enhanced Query Understanding with Conversation Context
async function understandQueryWithContext(currentMessage, conversationHistory = []) {
  const contextMessages = conversationHistory.map(msg => ({
    role: msg.role || "user",
    content: msg.message || msg.content
  }));

  const result = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a query understanding agent for a tire e-commerce database with conversation memory.
        
        Analyze the current message AND previous conversation context to extract cumulative information:
        1. Intent (search, filter, compare, count, gathering_info, etc.)
        2. Entities (vehicle make, model, year, tire size, brand, price range, etc.)
        3. Information completeness (what's missing for a complete tire search)
        4. Confidence in current understanding
        
        Database Schema Context:
        ${JSON.stringify(DATABASE_SCHEMA, null, 2)}
        
        IMPORTANT: Extract entities from ENTIRE conversation, not just current message.
        
        Respond ONLY in JSON format:
        {
          "intent": "search|filter|compare|count|gathering_info|price_range|availability",
          "entities": {
            "make": "string or null",
            "model": "string or null", 
            "year": "string or null",
            "size": "string or null",
            "brand": "string or null",
            "price_min": "number or null",
            "price_max": "number or null"
          },
          "missing_info": ["array of missing required fields"],
          "completeness_score": 0.0-1.0,
          "ready_for_search": true|false,
          "confidence": 0.0-1.0,
          "conversation_stage": "greeting|gathering_basic|gathering_details|ready_to_search|searching"
        }`
      },
      ...contextMessages,
      { role: "user", content: currentMessage },
    ],
    response_format: { type: "json_object" },
  });

  try {
    return JSON.parse(result.choices[0].message.content || "{}");
  } catch (error) {
    console.error("Query understanding error:", error);
    return { 
      intent: "gathering_info", 
      entities: {}, 
      missing_info: ["make", "model", "year", "size"],
      completeness_score: 0.1,
      ready_for_search: false,
      confidence: 0.1,
      conversation_stage: "gathering_basic"
    };
  }
}

// Information Gathering Agent
async function generateInformationRequest(queryUnderstanding, conversationHistory = []) {
  const contextMessages = conversationHistory.slice(-4).map(msg => ({
    role: msg.role || "user",
    content: msg.message || msg.content
  }));

  const result = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are an information gathering agent for tire sales. Your job is to collect the minimum required information to search for tires.

        REQUIRED INFORMATION PRIORITY:
        1. Vehicle Make (Toyota, Honda, etc.) - CRITICAL
        2. Vehicle Model (Camry, Accord, etc.) - CRITICAL  
        3. Vehicle Year (2020, 2021, etc.) - CRITICAL
        4. Tire Size (225/65R17) - CRITICAL if not determinable from vehicle info
        
        OPTIONAL BUT HELPFUL:
        - Tire Brand preference
        - Budget range
        
        Current entities gathered: ${JSON.stringify(queryUnderstanding.entities)}
        Missing info: ${JSON.stringify(queryUnderstanding.missing_info)}
        Conversation stage: ${queryUnderstanding.conversation_stage}
        
        GUIDELINES:
        - Ask for 1-2 pieces of info at a time, not everything at once
        - Be conversational and helpful
        - If they have make but no model, ask for model and year together
        - If they have make/model but no year, ask for year specifically
        - Once you have make/model/year, you can attempt a search (tire size can be determined)
        - Don't ask for tire size if you have complete vehicle info (make/model/year)
        
        Generate a helpful, conversational message asking for the next most important piece of information.`
      },
      ...contextMessages,
      { role: "assistant", content: "Based on our conversation, what information should I ask for next?" }
    ],
  });

  return result.choices[0].message.content || "Could you tell me what vehicle you need tires for?";
}

// Check if we have enough information to search
function hasMinimumInfoForSearch(entities) {
  // Minimum required: make + (model + year OR tire size)
  const hasMake = entities.make && entities.make.trim().length > 0;
  const hasModelAndYear = entities.model && entities.year;
  const hasTireSize = entities.size && entities.size.includes('/');
  
  return hasMake && (hasModelAndYear || hasTireSize);
}

// Enhanced SQL Generation with better context
async function generateSQLQuery(queryUnderstanding) {
  const result = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a SQL generation agent. Generate safe, optimized Prisma queries based on query understanding.

        Database Schema:
        ${JSON.stringify(DATABASE_SCHEMA, null, 2)}
        
        IMPORTANT RULES:
        1. ONLY use columns that exist in the schema
        2. Use Prisma query format, not raw SQL
        3. Use case-insensitive matching for text fields (contains with mode: 'insensitive')
        4. Always include reasonable limits (10-20 items max)
        5. Handle price ranges properly with gte/lte
        6. Use proper Prisma operators (contains, equals, gte, lte, etc.)
        7. NEVER use dangerous operations
        8. If tire size is missing but we have make/model/year, still search (tire size can be shown in results)
        
        Respond with ONLY a JSON object containing the Prisma query:
        {
          "query": {
            "where": { /* Prisma where conditions */ },
            "orderBy": { /* Prisma orderBy */ },
            "take": number,
            "select": { /* fields to return */ }
          },
          "operation": "findMany|count|aggregate",
          "explanation": "Brief explanation of the query logic"
        }`
      },
      { 
        role: "user", 
        content: `Generate Prisma query for: ${JSON.stringify(queryUnderstanding, null, 2)}` 
      },
    ],
    response_format: { type: "json_object" },
  });

  try {
    return JSON.parse(result.choices[0].message.content || "{}");
  } catch (error) {
    console.error("SQL generation error:", error);
    return null;
  }
}

// Basic validation without AI for better performance
function validateQueryBasic(generatedQuery, originalQuery) {
  const issues = [];
  const suggestions = [];
  let riskLevel = "low";
  
  // Check for dangerous keywords in original query
  const dangerousKeywords = [
    'drop', 'delete', 'update', 'insert', 'truncate', 'alter',
    'exec', 'execute', 'script', 'union', 'select *', '--', ';--'
  ];
  
  const lowerOriginal = originalQuery.toLowerCase();
  const hasDangerousKeywords = dangerousKeywords.some(keyword => 
    lowerOriginal.includes(keyword)
  );
  
  if (hasDangerousKeywords) {
    issues.push("Potentially dangerous SQL keywords detected");
    riskLevel = "high";
  }
  
  // Ensure reasonable limits
  if (generatedQuery && generatedQuery.query) {
    if (!generatedQuery.query.take || generatedQuery.query.take > 100) {
      if (!generatedQuery.query.take) {
        generatedQuery.query.take = 20; // Add default limit
      } else if (generatedQuery.query.take > 100) {
        generatedQuery.query.take = 20; // Reduce excessive limit
      }
    }
  }
  
  return {
    isValid: riskLevel !== "high",
    issues,
    suggestions,
    risk_level: riskLevel
  };
}

// Query Execution with Safety Measures
async function executeQuery(validatedQuery, operation = "findMany") {
  try {
    // Add safety limits
    if (validatedQuery.query.take > 50) {
      validatedQuery.query.take = 20;
    }

    let results;
    switch (operation) {
      case "count":
        results = await prisma.products.count(validatedQuery.query);
        break;
      case "aggregate":
        results = await prisma.products.aggregate(validatedQuery.query);
        break;
      default:
        results = await prisma.products.findMany({
          ...validatedQuery.query,
          take: validatedQuery.query.take || 10
        });
    }

    return {
      success: true,
      data: results,
      count: Array.isArray(results) ? results.length : 1
    };
  } catch (error) {
    console.error("Query execution error:", error);
    return {
      success: false,
      error: "Database query failed",
      details: error.message
    };
  }
}

// Result Processing and Natural Language Response Agent
async function processAndPresentResults(results, originalQuery, queryUnderstanding, conversationHistory = []) {
  if (!results.success) {
    return "I'm sorry, I encountered an error while searching the database. Please try rephrasing your query.";
  }

  if (!results.data || (Array.isArray(results.data) && results.data.length === 0)) {
    return generateNoResultsResponse(queryUnderstanding);
  }

  const contextMessages = conversationHistory.slice(-2).map(msg => ({
    role: msg.role || "user",
    content: msg.message || msg.content
  }));

  const result = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a result presentation agent for a tire e-commerce site.
        
        Convert database results into natural, helpful responses for customers.
        
        Guidelines:
        1. Be conversational and helpful, reference the conversation context
        2. Highlight key information (price, availability, compatibility)  
        3. Show tire size, brand, and price clearly
        4. If showing multiple options, organize them clearly (numbered list)
        5. Limit to showing 5-7 best options to avoid overwhelming
        6. Mention if there are more options available
        7. Ask if they want to see more or filter further
        8. Use tire industry terminology appropriately
        9. Format prices clearly with currency
        10. Keep responses concise but informative
        
        Original customer query: "${originalQuery}"`
      },
      ...contextMessages,
      { 
        role: "user", 
        content: `Present these tire search results naturally:
        
        Query Intent: ${queryUnderstanding.intent}
        Results Count: ${results.count}
        Data: ${JSON.stringify(results.data, null, 2)}` 
      },
    ],
  });

  return result.choices[0].message.content || "Here are your tire search results.";
}

// Generate helpful no-results responses
async function generateNoResultsResponse(queryUnderstanding) {
  const suggestions = [];
  
  if (queryUnderstanding.entities.make) {
    suggestions.push(`Try searching for other ${queryUnderstanding.entities.make} models`);
  }
  
  if (queryUnderstanding.entities.price_max) {
    suggestions.push("Consider expanding your budget range");
  }
  
  if (queryUnderstanding.entities.brand) {
    suggestions.push("Try other tire brands like Michelin, Bridgestone, or Goodyear");
  }

  let response = "I couldn't find any tires matching your exact criteria. ";
  
  if (suggestions.length > 0) {
    response += "Here are some suggestions:\n\n";
    response += suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n');
    response += "\n\nWould you like me to search with any of these alternatives?";
  } else {
    response += "Would you like me to:\n\n1. Search with broader criteria?\n2. Show popular tire options?\n3. Help you find the right tire size?";
  }
  
  return response;
}

// Enhanced Chat Handler with Conversation Context
export const handleChat = async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;
    
    if (!message) {
      return res.status(400).json({ 
        error: "Message is required",
        expectedFormat: {
          message: "string - current user message", 
          conversationHistory: "array - previous messages with role and content"
        }
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OpenAI API key not configured" });
    }

    console.log(`Processing message: "${message}" with ${conversationHistory.length} previous messages`);

    // Step 1: Understand the query with full conversation context
    const queryUnderstanding = await understandQueryWithContext(message, conversationHistory);
    
    // Step 2: Check if we need to gather more information
    if (!queryUnderstanding.ready_for_search) {
      const informationRequest = await generateInformationRequest(queryUnderstanding, conversationHistory);
      
      return res.json({
        reply: informationRequest,
        type: "gathering_info",
        metadata: {
          query_understanding: queryUnderstanding,
          conversation_stage: queryUnderstanding.conversation_stage,
          missing_info: queryUnderstanding.missing_info,
          completeness_score: queryUnderstanding.completeness_score
        }
      });
    }

    // Step 3: We have enough info - proceed with search
    const generatedQuery = await generateSQLQuery(queryUnderstanding);
    
    if (!generatedQuery) {
      return res.json({
        reply: "I had trouble generating a search with that information. Could you please clarify your vehicle details?",
        type: "error"
      });
    }

    // Step 4: Validate the query
    const validation = validateQueryBasic(generatedQuery, message);
    
    if (!validation.isValid || validation.risk_level === "high") {
      console.error("Query validation failed:", validation.issues);
      return res.json({
        reply: "I need to ask you to rephrase that tire search for security reasons. Please try a simpler search.",
        type: "security_error"
      });
    }

    // Step 5: Execute the validated query
    const results = await executeQuery(generatedQuery, generatedQuery.operation);

    // Step 6: Process and present results in natural language
    const naturalResponse = await processAndPresentResults(results, message, queryUnderstanding, conversationHistory);

    return res.json({
      reply: naturalResponse,
      type: "search_results",
      metadata: {
        query_understanding: queryUnderstanding,
        results_count: results.count || 0,
        generated_query_explanation: generatedQuery.explanation,
        validation_status: validation.risk_level,
        conversation_stage: "search_completed"
      }
    });

  } catch (error) {
    console.error("Chat handler error:", error);
    res.status(500).json({ 
      error: "Something went wrong processing your request.",
      type: "error"
    });
  }
};

// Utility function to format conversation history for debugging
export const formatConversationHistory = (history) => {
  return history.map(msg => ({
    role: msg.role || "user",
    content: msg.message || msg.content,
    timestamp: msg.timestamp || new Date().toISOString()
  }));
};