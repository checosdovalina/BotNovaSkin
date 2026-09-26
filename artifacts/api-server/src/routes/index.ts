import { Router, type IRouter } from "express";
import authRouter from "./auth";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import servicesRouter from "./services";
import faqsRouter from "./faqs";
import appointmentsRouter from "./appointments";
import botRouter from "./bot";
import webhooksRouter from "./webhooks";
import { requireLocalAuth } from "../lib/local-auth";

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);
router.use(webhooksRouter);
router.use(requireLocalAuth);
router.use(dashboardRouter);
router.use(servicesRouter);
router.use(faqsRouter);
router.use(appointmentsRouter);
router.use(botRouter);

export default router;
