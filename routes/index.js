import express from "express";
import { download_file, get_shared_file, get_shared_folder, get_share_folder, post_share_folder, get_index, post_logout, get_file, delete_file, get_update_file, post_update_file, get_update_folder, post_update_folder, get_folder, delete_folder, get_root, post_newfile, post_newfolder, get_login, post_login, get_signup, post_signup } from "../controllers/index.js";

const router = express.Router();

router.get("/", get_index);

router.post("/logout", post_logout);

router.get("/folder", get_root);

router.get("/file/:id", get_file);
router.get("/file/:id/update", get_update_file);
router.post("/file/:id/update", post_update_file);
router.post("/file/:id/delete", delete_file);

router.get("/folder/:id", get_folder);
router.get("/folder/:id/update", get_update_folder);
router.post("/folder/:id/update", post_update_folder);
router.post("/folder/:id/delete", delete_folder);

router.get("/folder/:id/share", get_share_folder);
router.post("/folder/:id/share", post_share_folder);

router.post("/folder/:id/newfile", post_newfile);
router.post("/folder/:id/newfolder", post_newfolder);

router.get("/share/folder/:id", get_shared_folder);
router.get("/share/file/:id", get_shared_file);

router.get("/download/:id", download_file);

router.get("/login", get_login);
router.post("/login", post_login);
router.get("/signup", get_signup);
router.post("/signup", post_signup);

export default router;