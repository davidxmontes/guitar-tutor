import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import type { FretboardResponse } from '../types';

interface UseFretboardResult {
  fretboardData: FretboardResponse | null;
  loading: boolean;
  error: string | null;
}

export function useFretboard(tuning: string = 'standard', tuningNotes?: string): UseFretboardResult {
  const [fretboardData, setFretboardData] = useState<FretboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchFretboard() {
      try {
        setLoading(true);
        const data = await apiClient.getFretboard(tuning, tuningNotes);
        setFretboardData(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load fretboard');
        console.error('Failed to fetch fretboard:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchFretboard();
  }, [tuning, tuningNotes]);

  return { fretboardData, loading, error };
}
