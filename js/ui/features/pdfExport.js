// js/ui/features/pdfExport.js

import { createPdfCore } from "../../pdf/pdfCore.js";
import { createPdfL } from "../../pdf/pdfL.js";
import { createPdfR } from "../../pdf/pdfR.js";

export function featurePdfExport(){
  return {
    id: "pdfExport",
    install(ctx){
      // Expose split PDF APIs so left/right UI cannot conflict.
      ctx.pdfCore = createPdfCore();
      ctx.pdfL = createPdfL(ctx);
      ctx.pdfR = createPdfR(ctx);
    }
  };
}
