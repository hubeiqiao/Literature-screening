'use client';

import { useEffect } from 'react';
import { inject } from '@vercel/analytics';

export function AnalyticsProvider() {
  useEffect(() => {
    inject();
  }, []);

  return null;
}
