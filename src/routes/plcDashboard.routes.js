import { Router } from "express";
import { getPlcDashboard, getPlcDashboardOptions } from "../controller/plcDashboard.controller.js";

const router = Router();

router.get("/", getPlcDashboard);
router.get("/options", getPlcDashboardOptions);

export default router;
