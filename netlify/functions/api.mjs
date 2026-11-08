import { getStore } from '@netlify/blobs';
import { handle } from '../../lib/api.mjs';

export default async (req) => {
  const store = getStore({ name: 'auli', consistency: 'strong' });
  return handle(req, store, {
    BAND_PASSWORD: Netlify.env.get('BAND_PASSWORD'),
    SESSION_SECRET: Netlify.env.get('SESSION_SECRET'),
  });
};

export const config = { path: '/api/*' };
