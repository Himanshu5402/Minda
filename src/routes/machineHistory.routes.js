import { Router } from "express";
import { 
  getMachineHistory, 
  getMachineSummary, 
  getMachineLatestStatus 
} from "../controller/machineHistory.controller.js";

const router = Router();

router.get("/", getMachineHistory);
router.get("/summary", getMachineSummary);
router.get("/latest-status", getMachineLatestStatus);

export default router;
