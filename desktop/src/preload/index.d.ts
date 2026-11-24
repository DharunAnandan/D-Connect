import type { DcApi } from './index'
declare global {
  interface Window {
    dc: DcApi
  }
}
export {}
