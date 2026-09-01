import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import servicesRouter from "./services";
import faqsRouter from "./faqs";
import appointmentsRouter from "./appointments";
import botRouter from "./bot";
import webhooksRouter from "./webhooks";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(servicesRouter);
router.use(faqsRouter);
router.use(appointmentsRouter);
router.use(botRouter);
router.use(webhooksRouter);

export default router;
