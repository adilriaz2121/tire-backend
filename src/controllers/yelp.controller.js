
const YELP_API_BASE = 'https://api.yelp.com/v3';
const YELP_API_KEY = process.env.YELP_API_KEY;

export const searchBusinesses = async (req, res, next) => {
  try {
    if (!YELP_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'Yelp API key not configured'
      });
    }

    const {
      latitude = 40.7128,
      longitude = -74.0060,
      limit = 20,
      sort_by = 'best_match',
      term = 'mobile tire installers',
      location,
      radius,
      price,
      open_now,
      attributes
    } = req.query;

    const params = new URLSearchParams();
    
    if (location) {
      params.append('location', location);
    } else {
      params.append('latitude', latitude.toString());
      params.append('longitude', longitude.toString());
    // params.append('latitude', 40.7128.toString());
    // params.append('longitude', (-74.0060).toString());
    
    }
    
    params.append('term', term);
    params.append('limit', Math.min(parseInt(limit) || 20, 50).toString()); // Max 50 per Yelp API
    params.append('sort_by', sort_by);
    
    if (radius) params.append('radius', radius.toString());
    if (price) params.append('price', price.toString());
    if (open_now === 'true' || open_now === true) params.append('open_now', 'true');
    if (attributes) params.append('attributes', attributes);

    const url = `${YELP_API_BASE}/businesses/search?${params.toString()}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${YELP_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        success: false,
        error: errorData.error?.description || `Yelp API error: ${response.statusText}`,
        status: response.status
      });
    }

    const data = await response.json();

    return res.status(200).json({
      success: true,
      data: {
        businesses: data.businesses || [],
        total: data.total || 0,
        region: data.region || {}
      }
    });

  } catch (error) {
    console.error('Yelp search error:', error);
    return next(error);
  }
};


export const getBusinessDetails = async (req, res, next) => {
  try {
    if (!YELP_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'Yelp API key not configured'
      });
    }

    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Business ID is required'
      });
    }

    // Optional query params for additional data
    const { locale } = req.query;

    const params = new URLSearchParams();
    if (locale) params.append('locale', locale);

    const url = `${YELP_API_BASE}/businesses/${encodeURIComponent(id)}${params.toString() ? `?${params.toString()}` : ''}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${YELP_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        success: false,
        error: errorData.error?.description || `Yelp API error: ${response.statusText}`,
        status: response.status
      });
    }

    const data = await response.json();

    // Fetch reviews for the business
    let reviews = [];
    try {
      const reviewsUrl = `${YELP_API_BASE}/businesses/${encodeURIComponent(id)}/reviews`;
      const reviewsResponse = await fetch(reviewsUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${YELP_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      if (reviewsResponse.ok) {
        const reviewsData = await reviewsResponse.json();
        reviews = reviewsData.reviews || [];
      }
    } catch (reviewsError) {
      console.error('Error fetching reviews:', reviewsError);
      // Continue without reviews if fetch fails
    }

    return res.status(200).json({
      success: true,
      data: {
        ...data,
        reviews: reviews
      }
    });

  } catch (error) {
    console.error('Yelp business details error:', error);
    return next(error);
  }
};

