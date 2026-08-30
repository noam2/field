type Listener = (message: string) => void

let listener: Listener | null = null

export function setToastListener(fn: Listener | null): void {
  listener = fn
}

export function toast(message: string): void {
  listener?.(message)
}
