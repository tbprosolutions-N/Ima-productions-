// Fix for class-variance-authority import
declare module 'class-variance-authority' {
  export interface VariantProps<T> {
    [key: string]: any;
  }
  
  export function cva(base: string, config?: any): any;
}
