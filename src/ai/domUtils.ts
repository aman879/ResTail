export function setNativeValue(element: HTMLElement, value: string) {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    
    if (valueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter?.call(element, value);
    } else {
      valueSetter?.call(element, value);
    }
  } else {
    // ContentEditable
    element.innerHTML = value.replace(/\n/g, '<br>');
    element.textContent = value;
  }
  
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
