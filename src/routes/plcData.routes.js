import { Router } from "express";
import {
  createPlcData,
  getAllPlcData,
  getPlcReport,
  getMachineStoppage,
  downloadMachineStoppagePdf,
  getPlcDataById,
  updatePlcData,
  deletePlcData,
  getPlcErrorDistribution,
  getPlcDowntimeByMachine,
  getPlcTimeDistribution,
<<<<<<< HEAD
  getMachinePerformance,
=======
  downloadPlcReportExcel,
  downloadPlcReportPdf
>>>>>>> d4dc21e751ca3241b2944557f60e1dada894e953
} from "../controller/plcData.controller.js";

const router = Router();

router.post("/", createPlcData);
router.get("/machine-stoppage", getMachineStoppage);
router.get("/download-pdf", downloadMachineStoppagePdf);
router.get("/analytics/error-distribution", getPlcErrorDistribution);
router.get("/analytics/downtime-by-machine", getPlcDowntimeByMachine);
router.get("/analytics/time-distribution", getPlcTimeDistribution);
<<<<<<< HEAD
router.get("/machine-performance", getMachinePerformance);
=======
router.get("/report/download-pdf",   downloadPlcReportPdf);
router.get("/report/download-excel", downloadPlcReportExcel);
>>>>>>> d4dc21e751ca3241b2944557f60e1dada894e953
router.get("/report", getPlcReport);
router.get("/", getAllPlcData);
router.get("", getAllPlcData);
router.get("/:id", getPlcDataById);
router.put("/:id", updatePlcData);
router.delete("/:id", deletePlcData);
// in your routes file


export default router;
