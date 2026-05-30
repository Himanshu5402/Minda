/* eslint-disable no-undef */
import dotenv from "dotenv";
dotenv.config();


class Config {
    DB_HOST;
    DB_PORT;
    DB_NAME;
    DB_USER;
    DB_PASSWORD;
    DB_SYNC;
    NODE_ENV;
    LOCAL_CLIENT_URL;
    CLIENT_URL;
    JWT_SECRET;
    EMAIL_AUTH;
    EMAIL_PASSWORD;
    LOCAL_SERVER_URL;
    SERVER_URL;
    REDIS_URL;
    TIMELABS_BASE_URL;
    TIMELABS_AUTH_KEY;
    TIMELABS_ENCRYPTION_KEY;
    constructor() {
        this.DB_HOST = process.env.DB_HOST?.trim();
        this.DB_PORT = process.env.DB_PORT?.trim();
        this.DB_NAME = process.env.DB_NAME?.trim();
        this.DB_USER = process.env.DB_USER?.trim();
        this.DB_PASSWORD = process.env.DB_PASSWORD?.trim();
        this.DB_SYNC = process.env.DB_SYNC?.trim();
        this.NODE_ENV = process.env.NODE_ENV?.trim();
        this.LOCAL_CLIENT_URL = process.env.LOCAL_CLIENT_URL?.trim();
        this.CLIENT_URL = process.env.CLIENT_URL?.trim();
        this.JWT_SECRET = process.env.JWT_SECRET?.trim();
        this.EMAIL_AUTH = process.env.EMAIL_AUTH?.trim();
        this.EMAIL_PASSWORD = process.env.EMAIL_PASSWORD?.trim();
        this.SERVER_URL = process.env.SERVER_URL?.trim();
        this.LOCAL_SERVER_URL = process.env.LOCAL_SERVER_URL?.trim();
        this.REDIS_URL = process.env.REDIS_URL?.trim();
        this.TIMELABS_BASE_URL = process.env.TIMELABS_BASE_URL?.trim();
        this.TIMELABS_AUTH_KEY = process.env.TIMELABS_AUTH_KEY?.trim();
        this.TIMELABS_ENCRYPTION_KEY = process.env.TIMELABS_ENCRYPTION_KEY?.trim();
    }
};

export const config = new Config();

