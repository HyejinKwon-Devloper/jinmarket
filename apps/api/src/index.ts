import express from "express";

import { createApp } from "@jinmarket/server";

const app: ReturnType<typeof express> = createApp();

export default app;
