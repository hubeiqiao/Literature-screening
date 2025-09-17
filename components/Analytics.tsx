'use client';

import { useEffect } from 'react';
import Analytics from '@vercel/analytics';

export function AnalyticsProvider() {
  useEffect(() => {
    Analytics.inject();
  }, []);

  return null;
}
