// src/controllers/chatController.ts
import OpenAI from "openai";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Define functions for OpenAI function calling
const functions = [
  {
    name: "search_tires",
    description: "Search for tires in the database based on vehicle information and preferences. ALWAYS call this function when you have enough vehicle info (make + model + year) to search, even if the user just says 'show me' or 'find tires'.",
    parameters: {
      type: "object",
      properties: {
        make: {
          type: "string",
          description: "Vehicle manufacturer (e.g., Toyota, Honda, Ford)"
        },
        model: {
          type: "string",
          description: "Vehicle model (e.g., Camry, Civic, F-150)"
        },
        year: {
          type: "string",
          description: "Vehicle year (e.g., 2020, 2021, 2022)"
        },
        trim: {
          type: "string",
          description: "Vehicle trim level (optional)"
        },
        size: {
          type: "string",
          description: "Tire size (e.g., 225/65R17) - optional"
        },
        mfg: {
          type: "string",
          description: "Tire manufacturer/brand (e.g., Michelin, Bridgestone, Goodyear)"
        },
        min_price: {
          type: "number",
          description: "Minimum price filter"
        },
        max_price: {
          type: "number",
          description: "Maximum price filter"
        },
        limit: {
          type: "number",
          description: "Number of results to return (default: 10, max: 20)",
          default: 10
        }
      },
      required: []
    }
  },
  {
    name: "get_product_details",
    description: "Get detailed information about a specific tire product by ID",
    parameters: {
      type: "object",
      properties: {
        product_id: {
          type: "string",
          description: "The product ID"
        }
      },
      required: ["product_id"]
    }
  },
  {
    name: "get_available_sizes",
    description: "Get all available tire sizes for a specific vehicle",
    parameters: {
      type: "object",
      properties: {
        make: {
          type: "string",
          description: "Vehicle manufacturer"
        },
        model: {
          type: "string",
          description: "Vehicle model"
        },
        year: {
          type: "string",
          description: "Vehicle year"
        }
      },
      required: ["make", "model", "year"]
    }
  }
];

// Function implementations
async function searchTires(params) {
  try {
    const limit = Math.min(params.limit || 10, 20);

    // Determine tire sizes: explicit size OR infer from vehicle fitment table (Products)
    let candidateSizes = [];
    if (params.size) {
      candidateSizes = [String(params.size).trim()];
    } else if (params.make && params.model && params.year) {
      const fitments = await prisma.products.findMany({
        where: {
          ...(params.make ? { make: { contains: String(params.make), mode: "insensitive" } } : {}),
          ...(params.model ? { model: { contains: String(params.model), mode: "insensitive" } } : {}),
          ...(params.year ? { year: String(params.year) } : {}),
          ...(params.trim ? { trim: { contains: String(params.trim), mode: "insensitive" } } : {}),
        },
        select: { size: true },
      });
      candidateSizes = [...new Set(fitments.map((x) => String(x.size).trim()).filter(Boolean))];
    }

    const minPrice = params.min_price !== undefined && params.min_price !== null && params.min_price !== ""
      ? Number(params.min_price)
      : null;
    const maxPrice = params.max_price !== undefined && params.max_price !== null && params.max_price !== ""
      ? Number(params.max_price)
      : null;

    const sizesSql = candidateSizes.length
      ? Prisma.sql`AND lower(pd."size") IN (${Prisma.join(
          candidateSizes.map((s) => Prisma.sql`${s.toLowerCase()}`),
        )})`
      : Prisma.sql``;

    const brandSql = params.mfg
      ? Prisma.sql`AND lower(COALESCE(pd."brand", '')) LIKE ${`%${String(params.mfg).toLowerCase()}%`}`
      : Prisma.sql``;

    const havingSql =
      (Number.isFinite(minPrice) || Number.isFinite(maxPrice))
        ? Prisma.sql`HAVING
            (${Number.isFinite(minPrice) ? Prisma.sql`MIN(s."price") >= ${minPrice}` : Prisma.sql`TRUE`})
            AND
            (${Number.isFinite(maxPrice) ? Prisma.sql`MIN(s."price") <= ${maxPrice}` : Prisma.sql`TRUE`})`
        : Prisma.sql``;

    const items = await prisma.$queryRaw(
      Prisma.sql`
        SELECT
          pd.*,
          (ARRAY_AGG(s."id" ORDER BY s."price" ASC))[1] AS "stockId",
          MIN(s."price")::float8 AS "stockPrice",
          SUM(s."quantity")::int AS "stockQuantity"
        FROM "productDetail" pd
        JOIN "Stock" s
          ON lower(pd."size") = lower(s."size")
         AND lower(COALESCE(pd."brand", '')) = lower(s."mfg")
        WHERE pd."brand" IS NOT NULL
          AND pd."size" IS NOT NULL
          ${sizesSql}
          ${brandSql}
        GROUP BY pd."id"
        ${havingSql}
        ORDER BY MIN(s."price") ASC
        LIMIT ${limit}
      `,
    );

    const products = Array.isArray(items) ? items : [];

    console.log(`Found ${products.length} stocked products for:`, params);

    return {
      success: true,
      count: products.length,
      products: products.map((p) => {
        const brand = (p?.brand || "").toString();
        const model = (p?.model || p?.name || "").toString();
        const size = (p?.size || "").toString();
        const priceNum = Number(p?.stockPrice);
        const qtyNum = Number(p?.stockQuantity);
        const img = Array.isArray(p?.images) && p.images.length ? p.images[0] : (p?.thumbnail_image || null);
        return {
          // Use stockId if present for "buy" flows
          id: (p?.stockId || p?.id || "").toString(),
          product_detail_id: (p?.id || "").toString(),
          stock_id: (p?.stockId || "").toString(),
          name: `${brand} ${model}`.trim() || "Tire Product",
          tire_size: size,
          size,
          brand,
          tire_model: model,
          details: (p?.features || p?.benefits || p?.tags || p?.description || "").toString(),
          description: (p?.description || "").toString(),
          price: Number.isFinite(priceNum) ? priceNum : null,
          quantity: Number.isFinite(qtyNum) ? qtyNum : 0,
          stock: Number.isFinite(qtyNum) ? qtyNum : 0,
          in_stock: Number.isFinite(qtyNum) ? qtyNum > 0 : false,
          image: img,
        };
      }),
    };
  } catch (error) {
    console.error("Search error:", error);
    return {
      success: false,
      error: "Failed to search products",
      products: []
    };
  }
}

async function getProductDetails(params) {
  try {
    const id = (params.product_id || "").toString().trim();
    if (!id) return { success: false, error: "Product not found" };

    // Accept either a Stock.id or a productDetail.id
    const stock = await prisma.stock.findUnique({ where: { id } }).catch(() => null);

    let pd = null;
    let stockId = null;
    let stockPrice = null;
    let stockQuantity = null;

    if (stock) {
      stockId = stock.id;
      stockPrice = stock.price;
      stockQuantity = stock.quantity;

      pd = await prisma.productDetail.findFirst({
        where: {
          size: stock.size,
          brand: { equals: stock.mfg, mode: "insensitive" },
        },
      });
    } else {
      pd = await prisma.productDetail.findUnique({ where: { id } }).catch(() => null);
      if (pd) {
        // Pick cheapest stock for this product detail (brand+size)
        const cheapest = await prisma.stock.findFirst({
          where: {
            size: pd.size,
            mfg: { equals: (pd.brand || "").toString(), mode: "insensitive" },
          },
          orderBy: { price: "asc" },
        });
        stockId = cheapest?.id || null;
        stockPrice = cheapest?.price ?? null;
        stockQuantity = cheapest?.quantity ?? null;
      }
    }

    if (!pd) return { success: false, error: "Product not found" };

    const reviews = await prisma.reviews.findMany({
      where: {
        size: pd.size,
        brand: (pd.brand || "").toString(),
      },
      take: 5,
      orderBy: { createdAt: "desc" },
    });

    return {
      success: true,
      product: {
        id: (stockId || pd.id).toString(),
        product_detail_id: (pd.id || "").toString(),
        stock_id: stockId ? String(stockId) : null,
        tire_size: pd.size,
        brand: (pd.brand || "").toString(),
        model: ((pd.model || pd.name) || "").toString(),
        details: (pd.features || pd.benefits || pd.tags || pd.description || "").toString(),
        description: (pd.description || "").toString(),
        price: stockPrice !== null && stockPrice !== undefined ? `$${Number(stockPrice).toFixed(2)}` : "$—",
        stock: stockQuantity !== null && stockQuantity !== undefined ? Number(stockQuantity) : 0,
        in_stock: stockQuantity !== null && stockQuantity !== undefined ? Number(stockQuantity) > 0 : false,
        images: Array.isArray(pd.images) ? pd.images : [],
        thumbnail_image: pd.thumbnail_image || null,
        specs: {
          loadRange: pd.loadRange || null,
          utqg: pd.utqg || null,
          sidewall: pd.sidewall || null,
          load_rating: pd.load_rating || null,
          speed_rating: pd.speed_rating || null,
          tread_depth: pd.tread_depth || null,
          weight: pd.weight || null,
          origin: pd.origin || null,
          max_inflation_pressure: pd.max_inflation_pressure || null,
          approved_rim_width_min: pd.approved_rim_width_min || null,
          approved_rim_width_max: pd.approved_rim_width_max || null,
        },
        reviews,
      }
    };
  } catch (error) {
    console.error("Get product error:", error);
    return { success: false, error: "Failed to get product details" };
  }
}

async function getAvailableSizes(params) {
  try {
    const products = await prisma.products.findMany({
      where: {
        ...(params.make ? { make: { contains: String(params.make), mode: "insensitive" } } : {}),
        ...(params.model ? { model: { contains: String(params.model), mode: "insensitive" } } : {}),
        ...(params.year ? { year: String(params.year) } : {}),
      },
      select: { size: true },
    });

    const sizes = [...new Set(products.map((p) => String(p.size).trim()).filter(Boolean))].sort();

    return {
      success: true,
      vehicle: `${params.year} ${params.make} ${params.model}`,
      available_sizes: sizes,
      count: sizes.length
    };
  } catch (error) {
    console.error("Get sizes error:", error);
    return { success: false, error: "Failed to get available sizes" };
  }
}

// Extract vehicle info from conversation history
function extractVehicleInfoFromHistory(messages) {
  const info = {
    make: null,
    model: null,
    year: null,
    trim: null,
    size: null
  };

  for (const msg of messages) {
    const content = (msg.content || '').toLowerCase();
    
    const makes = ['toyota', 'honda', 'ford', 'chevrolet', 'nissan', 'bmw', 'mercedes', 'audi', 'lexus', 'acura', 'mazda', 'subaru', 'volkswagen', 'hyundai', 'kia', 'jeep', 'ram', 'gmc', 'dodge'];
    for (const make of makes) {
      if (content.includes(make)) {
        info.make = make.charAt(0).toUpperCase() + make.slice(1);
        break;
      }
    }

    const yearMatch = content.match(/\b(19\d{2}|20[0-3]\d)\b/);
    if (yearMatch) {
      info.year = yearMatch[1];
    }

    const sizeMatch = content.match(/\b\d{3}\/\d{2}R\d{2}\b/i);
    if (sizeMatch) {
      info.size = sizeMatch[0].toUpperCase();
    }
  }

  return info;
}

// Main chat handler
export const handleChat = async (req, res) => {
  try {
    const { message, conversationHistory, conversation_history } = req.body;
    const history = conversationHistory || conversation_history || [];

    if (!message) {
      return res.status(400).json({ 
        error: "Message is required" 
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ 
        error: "OpenAI API key not configured" 
      });
    }

    // CRITICAL FIX: Filter out frontend-only message types
    const cleanHistory = history.filter(msg => {
      // Only keep valid OpenAI message roles
      const validRoles = ['system', 'user', 'assistant', 'function'];
      return validRoles.includes(msg.role);
    });

    const vehicleContext = extractVehicleInfoFromHistory([...cleanHistory, { content: message }]);
    
    console.log('Vehicle context extracted:', vehicleContext);

    let contextPrompt = "You are a helpful tire shop assistant named TireBrain.";
    
    if (vehicleContext.make || vehicleContext.model || vehicleContext.year) {
      contextPrompt += `\n\nIMPORTANT CONTEXT FROM CONVERSATION HISTORY:`;
      if (vehicleContext.make) contextPrompt += `\n- Vehicle Make: ${vehicleContext.make}`;
      if (vehicleContext.model) contextPrompt += `\n- Vehicle Model: ${vehicleContext.model}`;
      if (vehicleContext.year) contextPrompt += `\n- Vehicle Year: ${vehicleContext.year}`;
      if (vehicleContext.size) contextPrompt += `\n- Tire Size: ${vehicleContext.size}`;
      contextPrompt += `\n\nDO NOT ask for information that is already in the context above. The user has already provided this information.`;
    }

    const messages = [
      {
        role: "system",
        content: `${contextPrompt}

AVAILABLE INFORMATION IN DATABASE:
- Vehicle fitment: Products (make, model, year, trim -> size, mfg)
- Tire catalog: productDetail (brand, model/name, size, specs, images)
- Inventory: Stock (mfg, item, size, price, quantity)

CRITICAL RULES FOR CONVERSATION FLOW:
1. **REMEMBER CONTEXT**: Always check the conversation history. If the user already told you their vehicle make, model, or year, DO NOT ask for it again.

2. **WHEN TO SEARCH**: 
   - If you have make + model + year from history or current message → IMMEDIATELY call search_tires
   - If user says "show me", "find", "search", "I want", "give me" → call search_tires with available info
   - If user provides a tire size → call search_tires with that size
   - DO NOT wait for all details - search with what you have

3. **PROGRESSIVE INFORMATION GATHERING**:
   - Missing make only? → Ask for make
   - Have make, missing model? → Ask for model  
   - Have make + model, missing year? → Ask for year
   - Have make + model + year? → SEARCH IMMEDIATELY, don't ask for more

4. **AFTER SEARCH RESULTS**:
   - When you receive products from search_tires, format a conversational response
   - Mention how many tires you found
   - Highlight 2-3 key options with their brands and prices
   - The products will be displayed as cards automatically on the frontend
   - You don't need to list all details - just be conversational

5. **ANSWERING QUESTIONS ABOUT PRODUCTS**:
   - If user asks "which is best", provide guidance based on the products found
   - Reference specific tire brands and models from the search results
   - Consider price, features, and use case
   - Be helpful and informative

6. **NO REDUNDANT QUESTIONS**: 
   - ❌ BAD: User said "I have a 2020 Honda Civic" → You ask "What year is your vehicle?"
   - ✅ GOOD: User said "I have a 2020 Honda Civic" → You call search_tires immediately

7. **NATURAL LANGUAGE**:
   - Use "manufacturer" or "brand" not "make"
   - Say "tire size" not just "size"
   - Be conversational and friendly

CONVERSATION EXAMPLES:

Example 1 - Complete info:
User: "I need tires for my 2020 Honda Civic"
You: [Call search_tires with make=Honda, model=Civic, year=2020]
You: "I found 8 great tire options for your 2020 Honda Civic! I see several quality brands like Michelin, Bridgestone, and Goodyear in the $80-150 range. Take a look at the options below - they're all excellent choices for your vehicle."

Example 2 - Follow-up question:
[Previous: User asked for 1997 Acura CL, you showed results]
User: "which one is best?"
You: "Based on your 1997 Acura CL, I'd recommend the Michelin Pilot Sport 4 at $129.99. It offers excellent all-season performance and has a great reputation for reliability. The Bridgestone Turanza is also a solid choice at $149.99 if you prioritize comfort and quiet ride. Both are highly rated and perfect for your vehicle."

Example 3 - With tire size:
User: "I need 205/55R16 tires"
You: [Call search_tires with size=205/55R16]
You: "I found several 205/55R16 tires. Here are some top options ranging from $80 to $140."

REMEMBER: Be conversational, helpful, and always search when you have enough info!`
      }
    ];

    // Add clean conversation history
    cleanHistory.forEach((msg) => {
      messages.push({
        role: msg.role || "user",
        content: msg.content || msg.message
      });
    });

    // Add current message
    messages.push({
      role: "user",
      content: message
    });

    console.log(`Processing: "${message}" with ${cleanHistory.length} previous messages`);

    let response = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: messages,
      functions: functions,
      function_call: "auto",
      temperature: 0.5
    });

    let responseMessage = response.choices[0].message;
    const allMessages = [...messages];
    let searchResults = null;

    let iterationCount = 0;
    const maxIterations = 5;

    while (responseMessage.function_call && iterationCount < maxIterations) {
      iterationCount++;
      
      const functionName = responseMessage.function_call.name;
      const functionArgs = JSON.parse(responseMessage.function_call.arguments);

      console.log(`Calling function: ${functionName}`, functionArgs);

      let functionResponse;

      switch (functionName) {
        case "search_tires":
          functionResponse = await searchTires(functionArgs);
          if (functionResponse.success && functionResponse.products?.length > 0) {
            searchResults = functionResponse.products;
          }
          break;
        case "get_product_details":
          functionResponse = await getProductDetails(functionArgs);
          break;
        case "get_available_sizes":
          functionResponse = await getAvailableSizes(functionArgs);
          break;
        default:
          functionResponse = { error: "Unknown function" };
      }

      allMessages.push({
        role: "assistant",
        content: null,
        function_call: responseMessage.function_call
      });

      allMessages.push({
        role: "function",
        name: functionName,
        content: JSON.stringify(functionResponse)
      });

      response = await openai.chat.completions.create({
        model: "gpt-4-turbo",
        messages: allMessages,
        functions: functions,
        function_call: "auto",
        temperature: 0.5
      });

      responseMessage = response.choices[0].message;
    }

    console.log('Final response:', responseMessage.content);
    console.log('Search results:', searchResults ? searchResults.length : 0);

    // CRITICAL FIX: Return clean history for frontend
    // Only include user and assistant messages (no function calls)
    const cleanConversationHistory = [
      ...cleanHistory,
      { role: "user", content: message },
      { role: "assistant", content: responseMessage.content }
    ];

    return res.json({
      reply: responseMessage.content,
      products: searchResults || [],
      conversation_history: cleanConversationHistory
    });

  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ 
      error: "Something went wrong",
      details: error.message 
    });
  }
};

// Helper endpoint to identify vehicle from image
export const identifyVehicle = async (req, res) => {
  try {
    const { image_base64 } = req.body;

    if (!image_base64) {
      return res.status(400).json({ error: "Image is required" });
    }

    console.log('Identifying vehicle from image...');

    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Identify the vehicle in this image with as much detail as possible.

IMPORTANT: 
- Be specific about the make (manufacturer)
- Identify the model if visible
- Estimate the year or year range based on the design
- Look for any badges, logos, or distinctive features

Format your response as:
Make: [manufacturer name]
Model: [model name if identifiable, or "Unknown" if not clear]
Year: [specific year if certain, or year range like "2018-2020", or "Unknown"]
Confidence: [High/Medium/Low]

Be as accurate as possible. If you're not sure about something, indicate that.`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${image_base64}`
              }
            }
          ]
        }
      ],
      max_tokens: 300
    });

    const identification = response.choices[0].message.content;
    console.log('Vehicle identified:', identification);

    const makeMatch = identification?.match(/Make:\s*([^\n,]+)/i);
    const modelMatch = identification?.match(/Model:\s*([^\n,]+)/i);
    const yearMatch = identification?.match(/Year:\s*(\d{4})/i);
    const confidenceMatch = identification?.match(/Confidence:\s*([^\n,]+)/i);

    const parsed = {
      make: makeMatch?.[1]?.trim(),
      model: modelMatch?.[1]?.trim() !== 'Unknown' ? modelMatch?.[1]?.trim() : null,
      year: yearMatch?.[1]?.trim(),
      confidence: confidenceMatch?.[1]?.trim() || 'Medium'
    };

    console.log('Parsed vehicle info:', parsed);

    let searchResults = null;
    let searchMessage = '';

    if (parsed.make) {
      console.log('Searching for tires with:', parsed);

      const searchParams = {
        make: parsed.make,
        model: parsed.model || undefined,
        year: parsed.year || undefined,
        limit: 10
      };

      Object.keys(searchParams).forEach(key => 
        searchParams[key] === undefined && delete searchParams[key]
      );

      const tireSearchResult = await searchTires(searchParams);

      if (tireSearchResult.success && tireSearchResult.products?.length > 0) {
        searchResults = tireSearchResult.products;
        searchMessage = `Great news! I found ${tireSearchResult.count} tire${tireSearchResult.count === 1 ? '' : 's'} in our inventory that fit${tireSearchResult.count === 1 ? 's' : ''} your vehicle.`;
        console.log(`Found ${searchResults.length} tires`);
      } else {
        searchMessage = `I've identified your vehicle, but unfortunately we don't currently have any tires in stock for ${parsed.year ? parsed.year + ' ' : ''}${parsed.make}${parsed.model ? ' ' + parsed.model : ''} in our database. You can try:\n• Contacting us directly for special orders\n• Checking back later for new inventory\n• Searching for alternative tire sizes`;
        console.log('No tires found for vehicle');
      }
    } else {
      searchMessage = "I had trouble identifying the vehicle clearly from the image. Could you please provide the vehicle details manually? I need the manufacturer, model, and year.";
    }

    let responseMessage = '';
    
    if (parsed.make) {
      const vehicleDetails = [
        parsed.make ? `• Manufacturer: ${parsed.make}` : null,
        parsed.model && parsed.model !== 'Unknown' ? `• Model: ${parsed.model}` : null,
        parsed.year ? `• Year: ${parsed.year}` : null
      ].filter(Boolean).join('\n');

      responseMessage = `Here's what I identified from your photo:\n\n${vehicleDetails}${parsed.confidence ? `\n• Confidence: ${parsed.confidence}` : ''}\n\n${searchMessage}`;
    } else {
      responseMessage = searchMessage;
    }

    return res.json({
      identification: responseMessage,
      parsed: parsed,
      products: searchResults || [],
      has_results: searchResults && searchResults.length > 0,
      search_attempted: !!parsed.make
    });

  } catch (error) {
    console.error("Vehicle identification error:", error);
    res.status(500).json({ 
      error: "Failed to identify vehicle",
      details: error.message 
    });
  }
};