import { ImageResponse } from '@vercel/og';
import { BrandOgTemplate } from './template';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return new ImageResponse(BrandOgTemplate(), { width: 1200, height: 630 });
};
