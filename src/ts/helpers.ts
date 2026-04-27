export const dispatch = (e: string, detail: any) =>
  dispatchEvent(new CustomEvent(e, { detail }))

export function listen<T>(e: string, handler : (arg: T) => void) : () => void {
  var listener : EventListener = ((e: CustomEventInit<T>) => {
    if(!e.detail) {
      return;
    }
    handler(e.detail)
  })
  window.addEventListener(e, listener)
  return () => window.removeEventListener(e, listener)
}
