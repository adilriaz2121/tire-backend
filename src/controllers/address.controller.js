import { validateAddress } from '../utils/fedex.service.js';

export const validateAddressHandler = async (req, res) => {
  const { streetLines, city, state, zip } = req.body;

  if (!streetLines || !city || !state || !zip) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: streetLines, city, state, zip',
    });
  }

  const result = await validateAddress({ streetLines, city, state, zip });

  return res.json({
    success: true,
    ...result,
  });
};
