import { Router } from "express";
import { 
  getMachineHistory, 
  getMachineSummary, 
  getMachineLatestStatus,
  getMachineModelOptions,
} from "../controller/machineHistory.controller.js";

const router = Router();

router.get("/", getMachineHistory);
router.get("/summary", getMachineSummary);
router.get("/latest-status", getMachineLatestStatus);
router.get("/models", getMachineModelOptions);

export default router;
