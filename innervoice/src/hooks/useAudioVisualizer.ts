import { useCallback, useEffect, useRef, useState } from 'react'

function normalizeLevels(data: Uint8Array) {
  const buckets = 6
  const bucketSize = Math.max(1, Math.floor(data.length / buckets))
  return Array.from({ length: buckets }, (_, idx) => {
    const start = idx * bucketSize
    const end = Math.min(data.length, start + bucketSize)
    if (start >= end) return 0
    const slice = data.slice(start, end)
    const avg = slice.reduce((total, value) => total + value, 0) / slice.length
    return avg / 255
  })
}

export function useAudioVisualizer() {
  const [levels, setLevels] = useState<number[]>(Array.from({ length: 6 }, () => 0))
  const contextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)

  const stopAnimation = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }

  const connect = useCallback((audio: HTMLAudioElement) => {
    stopAnimation()
    if (!contextRef.current) {
      contextRef.current = new AudioContext()
    }

    const context = contextRef.current
    const analyser = context.createAnalyser()
    analyser.fftSize = 32
    analyserRef.current = analyser

    if (sourceRef.current) {
      sourceRef.current.disconnect()
    }

    sourceRef.current = context.createMediaElementSource(audio)
    sourceRef.current.connect(analyser)
    analyser.connect(context.destination)

    const data = new Uint8Array(analyser.frequencyBinCount)

    const tick = () => {
      analyser.getByteFrequencyData(data)
      setLevels(normalizeLevels(data))
      rafRef.current = requestAnimationFrame(tick)
    }
    tick()
  }, [])

  useEffect(
    () => () => {
      stopAnimation()
      sourceRef.current?.disconnect()
      analyserRef.current?.disconnect()
      if (contextRef.current) {
        void contextRef.current.close()
      }
    },
    [],
  )

  return { levels, connect }
}
