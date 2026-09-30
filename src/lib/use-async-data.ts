import { useCallback, useEffect, useRef, useState } from 'react'

import { errorMessage } from './utils'

export interface AsyncState<T> {
  data: T | null
  error: string | null
  loading: boolean
}

export interface UseAsyncDataResult<T> extends AsyncState<T> {
  reload: () => void
  setData: (value: T | null) => void
}

/**
 * Loads data once per `key` and exposes loading/error state.
 *
 * The loader is read through a ref so callers can write an inline arrow
 * function without re-firing the request on every render — the `key` is the
 * only thing that decides when to refetch.
 */
export function useAsyncData<T>(
  key: string,
  loader: () => Promise<T>,
  enabled = true,
): UseAsyncDataResult<T> {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    error: null,
    loading: enabled,
  })
  const [nonce, setNonce] = useState(0)

  const loaderRef = useRef(loader)
  loaderRef.current = loader

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, error: null, loading: false })
      return
    }

    let active = true
    setState((previous) => ({ ...previous, loading: true, error: null }))

    loaderRef
      .current()
      .then((data) => {
        if (active) setState({ data, error: null, loading: false })
      })
      .catch((error: unknown) => {
        if (active) setState({ data: null, error: errorMessage(error), loading: false })
      })

    return () => {
      active = false
    }
  }, [key, enabled, nonce])

  const reload = useCallback(() => setNonce((value) => value + 1), [])

  const setData = useCallback((value: T | null) => {
    setState({ data: value, error: null, loading: false })
  }, [])

  return { ...state, reload, setData }
}
