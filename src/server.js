
import http from "http";
import cors from "cors";
import express, { json, urlencoded } from "express";
import compression from "compression";
import cookieParser from "cookie-parser";
import { fileURLToPath } from "url";
import path from "path";
import { Server } from "socket.io";
import { ensureRedisConnected } from "./config/redis.js";

// ----------------- local imports ---------------------
import { CheckDbConnection } from "./dbConnection.js";
import { config } from "./config.js";
import { logger } from "./utils/logger.js";
import { BadRequestError, Customerror } from "./utils/errorHandler.js";
import mainRoutes from "./routes.js";
import { StatusCodes } from "http-status-codes";
import { startPlcDashboardWorker } from "./services/plcDashboardWorker.service.js";
import { startMachineHistoryWorker } from "./services/machineHistoryWorker.service.js";


const SERVER_PORT = 9021;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const allowedOrigins = [
    config.CLIENT_URL,
    config.LOCAL_CLIENT_URL,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
].filter(Boolean);

const corsOptions = {
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }

        callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};

// Export io instance for use in controllers
let io;


export const Start = (app) => {
    middlewares(app);
    routeMiddlewares(app);
    errorHandler(app);
    StartServer(app)
    Connections()
}

function middlewares(app) {
    app.use(json({ limit: "20mb" }));
    app.use(urlencoded({ extended: true, limit: "20mb" }));
    app.set('trust proxy', true)
    app.use(express.static(path.join(__dirname, 'pages')));
    app.use("/files", express.static(path.join(__dirname, "../public/temp")));
    app.use(cors(corsOptions));
    app.use(compression());
    app.use(cookieParser());
}

function routeMiddlewares(app) {
    app.use("/health", (_req, res) => res.send("server is running and ok"))
    app.use("/api/v1", mainRoutes);
}

function errorHandler(app) {
    app.get("/", (_req, _res, next) => {
        next(new BadRequestError("this route is not exist ", "errorHandler() method error"))
    });

    app.use((err, _req, res, next) => {
        if (err instanceof Customerror) {
            logger.error(`error coming from ${err?.comingfrom} with message: ${err.message} and status code: ${err.statusCode}`);
            res.status(err.statusCode).json(err.seriyalizeErrors());
        } else {
            logger.error(`error coming with message: ${err.message} `);
            res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({message:err.message});
        }
        next(err);
    });
}

async function Connections() {
    // Initialize database connections or other services here
    const redis = await ensureRedisConnected();
    if (redis) {
        console.log("Redis Ready");
    } else {
        console.log("Redis unavailable — API will run without cache");
    }
    await CheckDbConnection();
    startPlcDashboardWorker();
    startMachineHistoryWorker();
}

function StartServer(app) {
    const server = http.createServer(app);

    // Initialize Socket.IO
    io = new Server(server, {
        cors: {
            origin(origin, callback) {
                if (!origin || allowedOrigins.includes(origin)) {
                    callback(null, true);
                    return;
                }

                callback(new Error("Not allowed by Socket.IO CORS"));
            },
            methods: ["GET", "POST"],
            credentials: true,
        },
    });

    // Socket.IO connection handling
    io.on("connection", (socket) => {
        logger.info(`✅ Socket connected: ${socket.id}`);
        logger.info(`📊 Total connected sockets: ${io.sockets.sockets.size}`);

        // Test event to verify connection
        socket.emit("test", { message: "Socket connected successfully" });

        socket.on("disconnect", (reason) => {
            logger.info(`❌ Socket disconnected: ${socket.id}, Reason: ${reason}`);
            logger.info(`📊 Total connected sockets: ${io.sockets.sockets.size}`);
        });

        // Handle connection errors
        socket.on("error", (error) => {
            logger.error(`Socket error for ${socket.id}:`, error);
        });
    });

    // Log when socket.io has connection errors
    io.engine.on("connection_error", (err) => {
        logger.error("Socket.IO connection error:", err);
    });

    server.listen(SERVER_PORT, '0.0.0.0', () => {
        // eslint-disable-next-line no-undef
        logger.info(`Server will start with process id : ${process.pid} started on port ${SERVER_PORT}`);
    })
}


export { io }