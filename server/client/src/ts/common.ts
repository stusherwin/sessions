const logging = true

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

const doNothing = () => {}
export function log(...args: any[]) {
  if(!logging) {
    return doNothing
  }

  var error = new Error()
  var stack = error.stack
  var caller = stack?.split('\n')[1].trim()
  var fn = caller?.split('@')[0]
  var file = caller?.split('/').reverse()[0].split('?')[0]

  if(args.length == 1 && args[0].toString() == "[object Arguments]") {
    return Function.prototype.bind.apply(console.log, [console, file + ' | ' + fn + '(', ...args[0], ')'])    
  } else {
    return Function.prototype.bind.apply(console.log, [console, file + ' | ' + fn + ':', ...args]) 
  }
};