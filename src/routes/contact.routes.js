import express from "express";
import { errorHandler } from "../handlers/error.handlers.js";
import { 
    createContact, 
    getAllContacts, 
    getContactById, 
    markContactAsRead, 
    markAllContactsAsRead, 
    deleteContact, 
    deleteMultipleContacts, 
    getContactStats 
} from "../controllers/contact.controller.js";

const contactRouter = express.Router();

// Public route - users can create contact messages
contactRouter.post("/", errorHandler(createContact));

// Admin routes - require authentication (you can add auth middleware here)
contactRouter.get("/", errorHandler(getAllContacts));
contactRouter.get("/stats", errorHandler(getContactStats));
contactRouter.get("/:id", errorHandler(getContactById));
contactRouter.patch("/:id/read", errorHandler(markContactAsRead));
contactRouter.patch("/mark-all-read", errorHandler(markAllContactsAsRead));
contactRouter.delete("/:id", errorHandler(deleteContact));
contactRouter.delete("/bulk/delete", errorHandler(deleteMultipleContacts));

export default contactRouter;
