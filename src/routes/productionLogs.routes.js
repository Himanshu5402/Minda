import { Router } from "express";
import {
  getMyProductionLogs,
  getMyProductionLogsSummary,
} from "../controller/productionLogs.controller.js";

const router = Router();

router.get("/", getMyProductionLogs);
router.get("/summary", getMyProductionLogsSummary);

export default router;
