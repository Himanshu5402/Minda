import { StatusCodes } from "http-status-codes";
import {
  allCardsData,
  GetDailyAssemblyStatus,
  GetDailyErrorsAssembly,
  GetMonthlyPerformance,
  GetMonthlyTrend,
} from "../services/dashboard.service.js";
import { AsyncHandler } from "../utils/asyncHandler.js";
import { getOrSetJSON } from "../utils/redisCache.js";

export const GetAllCardsData = AsyncHandler(async (req, res) => {
  const { company, plant, start_date, end_date } = req.query;
  const cacheKey = `dashboard:cards:${company || ""}:${plant || ""}:${start_date || ""}:${end_date || ""}`;

  const { data: result } = await getOrSetJSON(cacheKey, 120, () =>
    allCardsData(company, plant, start_date, end_date)
  );

  res.status(StatusCodes.OK).json({ data: result });
});

export const GetMonthlyTrendData = AsyncHandler(async (req, res) => {
  const user = req.currentUser;
  const cacheKey = `dashboard:monthly-trend:${user?._id}:${user?.is_admin}`;

  const { data: result } = await getOrSetJSON(cacheKey, 90, () =>
    GetMonthlyTrend(user?.is_admin, user?._id)
  );

  res.status(StatusCodes.OK).json({ data: result });
});

export const getAssemblyData = AsyncHandler(async (req, res) => {
  const user = req.currentUser;
  const cacheKey = `dashboard:assembly-status:${user?._id}:${user?.is_admin}`;

  const { data: result } = await getOrSetJSON(cacheKey, 60, () =>
    GetDailyAssemblyStatus(user?.is_admin, user?._id)
  );

  res.status(StatusCodes.OK).json({ data: result });
});

export const getAllActiveAssembyMonthly = AsyncHandler(async (req, res) => {
  const user = req.currentUser;
  const { start_date, end_date } = req.query;
  const cacheKey = `dashboard:monthly-performance:${user?._id}:${start_date || ""}:${end_date || ""}`;

  const { data: result } = await getOrSetJSON(cacheKey, 120, () =>
    GetMonthlyPerformance(user?.is_admin, user?._id, start_date, end_date)
  );

  res.status(StatusCodes.OK).json({ data: result });
});

export const getAllAssemblyErrorHistory = AsyncHandler(async (req, res) => {
  const user = req.currentUser;
  const { start_date, end_date, company, plant } = req.query;
  const cacheKey = `dashboard:assembly-errors:${user?._id}:${start_date || ""}:${end_date || ""}:${company || ""}:${plant || ""}`;

  const { data: result } = await getOrSetJSON(cacheKey, 120, () =>
    GetDailyErrorsAssembly(
      user?.is_admin,
      user?._id,
      start_date,
      end_date,
      company,
      plant
    )
  );

  res.status(StatusCodes.OK).json({ data: result });
});
