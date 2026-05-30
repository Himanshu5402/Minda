import { StatusCodes } from "http-status-codes";
import { AsyncHandler } from "../utils/asyncHandler.js";
import {
  createPlcProductService,
  getAllPlcProductsService,
  getPlcProductByIdService,
  updatePlcProductService,
  deletePlcProductService,
} from "../services/plcProduct.service.js";
import { cacheDelByPrefix, getOrSetJSON } from "../utils/redisCache.js";

const PLC_CACHE_PREFIX = "plc-products:";

export const createPlcProduct = AsyncHandler(async (req, res) => {
  const result = await createPlcProductService(req.body);
  await cacheDelByPrefix(PLC_CACHE_PREFIX);

  res.status(StatusCodes.CREATED).json({
    message: "PLC Product created successfully",
    data: result,
  });
});

export const getAllPlcProducts = AsyncHandler(async (req, res) => {
  const { search, machine_name } = req.query;

  const filters = {};
  if (search) filters.search = search;
  if (machine_name) filters.machine_name = machine_name;

  const cacheKey = `${PLC_CACHE_PREFIX}${JSON.stringify(filters)}`;

  const { data: result } = await getOrSetJSON(cacheKey, 60, () =>
    getAllPlcProductsService(filters)
  );

  res.status(StatusCodes.OK).json({
    message: "PLC Products fetched successfully",
    data: result,
  });
});

export const getPlcProductById = AsyncHandler(async (req, res) => {
  const cacheKey = `${PLC_CACHE_PREFIX}id:${req.params.id}`;

  const { data: result } = await getOrSetJSON(cacheKey, 60, () =>
    getPlcProductByIdService(req.params.id)
  );

  res.status(StatusCodes.OK).json({
    message: "PLC Product fetched successfully",
    data: result,
  });
});

export const updatePlcProduct = AsyncHandler(async (req, res) => {
  const result = await updatePlcProductService(req.params.id, req.body);
  await cacheDelByPrefix(PLC_CACHE_PREFIX);

  res.status(StatusCodes.OK).json({
    message: "PLC Product updated successfully",
    data: result,
  });
});

export const deletePlcProduct = AsyncHandler(async (req, res) => {
  await deletePlcProductService(req.params.id);
  await cacheDelByPrefix(PLC_CACHE_PREFIX);

  res.status(StatusCodes.OK).json({
    message: "PLC Product deleted successfully",
  });
});
