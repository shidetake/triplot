// 実装は shared 側（RN と共用の単一の真実）。既存 import を壊さないよう re-export。
export {
  buildImportAddress,
  IMPORT_DOMAIN,
  IMPORT_LOCALPART,
  parseImportToken,
} from "@triplot/shared/importAddress";
