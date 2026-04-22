import { body, param, matchedData, validationResult } from "express-validator";
import prisma from "../lib/prisma.js";
import passport from "passport";
import bcrypt from "bcrypt";
import multer from "multer";
import fs from "node:fs/promises";
import { match } from "node:assert";
import { supabase } from "../lib/supabase.js";
import { SupabaseClient } from "@supabase/supabase-js";

const upload = multer({ dest: './public/files/' });

/* validators */
const validator_username = () => body("username")
        .isLength({ min: 4, max: 40 }).withMessage("Username should be from 4 to 40 characters long");
const validator_password = () => body("password")
        .isLength({ min: 6, max: 100 }).withMessage("Password should be from 6 to 100 characters long");

/* controllers */

export const get_index = (req, res) => {
    res.render("index");
};

export const post_logout = [
    (req, res, next) => {
        if (!req.isAuthenticated()) {
            return res.redirect("/login");
        }
        next();
    },
    (req, res) => {
        req.logout((err) => {
            if (err) {
                console.log(err);
            }
            res.redirect("/");
        })
    }
];

export const get_root = [
    (req, res, next) => {
        if (!req.isAuthenticated()) {
            return res.redirect("/login");
        }
        next();
    },
    async (req, res, next) => {
        try {
            const folder = await prisma.folder.findFirst({
                where: { user_id: req.user.id, parentId: null },
                include: { children: true, files: true }
            });
            if (!folder) {
                return res.render("error", { message: "404 - Root not found" });
            }
            res.render("folder", { folder });
        }
        catch(err) {
            next(err);
        }
    }
];

export const get_file = [
    (req, res, next) => {
        if (!req.isAuthenticated()) {
            return res.redirect("/login");
        }
        next();
    },
    param("id")
        .isInt({ min: 0 }).toInt(),
    async (req, res, next) => {
        try {
            const { id } = matchedData(req);
            const file = await prisma.file.findUnique({
                where: { id, user_id: req.user.id },
                include: { user: true }
            });
            if (!file) {
                return res.render("error", { message: "404 - Not found" });
            }
            res.render("file", { file });
        }
        catch(err) {
            next(err);
        }
    }
];

export const delete_file = [
    (req, res, next) => {
        if (!req.isAuthenticated()) {
            return res.redirect("/login");
        }
        next();
    },
    param("id")
        .isInt({ min: 0 }).toInt(),
    async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(404).redirect("/folder");
        }
        const { id } = matchedData(req);
        try {
            const file = await prisma.file.findFirst({
                where: { id }
            });
            if (!file) {
                return res.redirect('/folder');
            }
            const deleted_file = await prisma.file.delete({
                where: { id }
            });
            if (!deleted_file) {
                return res.status(404).redirect("back");
            }
            const deleted_file_sb = await supabase.storage
                .from("files")
                .remove([deleted_file.path]);
            res.redirect(`/folder/${deleted_file.folderId}`);
        }
        catch (err) {
            next(err);
        }
    }
];

export const delete_folder = [
    (req, res, next) => {
        if (!req.isAuthenticated()) {
            return res.redirect("/login");
        }
        next();
    },
    param("id")
        .isInt({ min: 0 }).toInt(),
    async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.redirect("/folder");
        }
        const { id } = matchedData(req);

        try {
            const orig_folder = await prisma.folder.findFirst({
                where: {
                    id, user_id: req.user.id
                }
            });
            if (!orig_folder) {
                res.redirect("/folder");
            }
            const file_ids_to_delete = new Set();
            const file_paths_to_delete = new Set();
            const folder_ids_to_delete = new Set();
            const helper_delete_file = async (folder_id) => {
                const folder = await prisma.folder.findFirst({
                    where: {
                        id: folder_id
                    },
                    include: {
                        children: true, files: true
                    }
                });
                if (!folder)
                    return;
                for (let i = 0; i < folder.files.length; i++) {
                    file_ids_to_delete.add(folder.files[i].id);
                    file_paths_to_delete.add(folder.files[i].path);
                }
                for (let i = 0; i < folder.children.length; i++) {
                    folder_ids_to_delete.add(folder.children[i].id);
                    await helper_delete_file(folder.children[i].id);
                }
            };
            await helper_delete_file(id);
            folder_ids_to_delete.add(id);

            const deleted_files_sb = await supabase.storage
                .from("files")
                .remove(Array.from(file_paths_to_delete));
            const deleted_files = await prisma.file.deleteMany({
                where: {
                    id: {
                        in: Array.from(file_ids_to_delete)
                    }
                }
            });
            const deleted_folders = await prisma.folder.deleteMany({
                where: {
                    id: {
                        in: Array.from(folder_ids_to_delete)
                    }
                }
            });
            return res.redirect(`/folder/${orig_folder.parentId}`);
        }
        catch (err) {
            next(err);
        }
    }
];

export const get_folder = [
    (req, res, next) => {
        if (!req.isAuthenticated()) {
            return res.redirect("/login");
        }
        next();
    },
    param("id")
        .isInt({ min: 0 }).toInt(),
    async (req, res, next) => {
        try {
            const { id } = matchedData(req);
            const folder = await prisma.folder.findFirst({
                where: { id, user_id: req.user.id },
                include: {
                    files: true, children: true   
                }
            });
            if (!folder) {
                return res.render("error", { message: "404 - Not found" });
            }
            res.render("folder", { folder });
        }
        catch(err) {
            next(err);
        }
    }
];

export const post_newfile = [
    (req, res, next) => {
        if (!req.isAuthenticated()) {
            return res.redirect("/login");
        }
        next();
    },
    param("id")
        .isInt({ min: 0 }).toInt(),
    upload.array("file"),
    async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty() || !req.files) {
            return res.redirect(`/folder/${req.params.id}`);
        }

        try {
            const { id, name } = matchedData(req);
            const folder = await prisma.folder.findFirst({
                where: { id, user_id: req.user.id }
            });
            if (!folder) {
                return res.render("error", { message: "404 - Not found" });
            }
            const filtered_files = req.files.filter(file => file.size <= 15*1024*1024);

            for (let i = 0; i < filtered_files.length; i++) {
                const file = filtered_files[i];
                const fileBuffer = await fs.readFile(file.path);

                const { data, error } = await supabase.storage
                    .from("files")
                    .upload(file.filename, fileBuffer, {
                        contentType: file.mimetype,
                        upsert: false
                    });

                if (error) {
                    console.error(`supabase error : ${error}`);
                    continue;
                }

                await prisma.file.create({
                    data: {
                        name: file.originalname,
                        path: file.filename,
                        size: file.size,
                        user_id: req.user.id,
                        folderId: id
                    }
                });
            }
            res.redirect(`/folder/${id}`);
        }
        catch (err) {
            next(err);
        }
        finally {
            for (let i = 0; i < req.files.length; i++) {
                await fs.unlink(req.files[i].path);
            }
        }
    }
];

export const post_newfolder = [
    (req, res, next) => {
        if (!req.isAuthenticated()) {
            return res.redirect("/login");
        }
        next();
    },
    param("id")
        .isInt({ min: 0 }).toInt(),
    body("name")
        .isLength({ min: 1, max: 100 }),
    async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.redirect(`/folder/${req.params.id}`);
        }

        try {
            const { id, name } = matchedData(req);
            const folder = await prisma.folder.findFirst({
                where: { id, user_id: req.user.id }
            });
            if (!folder) {
                return res.render("error", { message: "404 - Not found" });
            }
            const newfolder = await prisma.folder.create({
                data: {
                    name,
                    user_id: req.user.id,
                    parentId: id
                }
            });
            if (!newfolder) {
                return res.render("error", { message: "Error creating the folder" });
            }
            return res.redirect(`/folder/${id}`);
        }
        catch(err) {
            next(err);
        }
    }
];

export const get_login = [
    (req, res, next) => {
        if (req.isAuthenticated()) { return res.redirect("/"); }
        next();
    },
    (req, res) => {
        res.render("login");
    }
];

export const post_login = [
    (req, res, next) => {
        if (req.isAuthenticated()) { return res.redirect("/"); }
        next();
    },
    validator_username(),
    validator_password(),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).render("login", { body: req.body, errors: errors.array() });
        }
        passport.authenticate(
            "local", 
            (err, user, info) => {
                if (err) { return next(err); }
                if (!user) { return res.status(400).render("login", { body: req.body, errors: [{ msg: info.message }] }); }
                req.login(user, (err) => {
                    if (err) { return next(err); }
                    res.redirect("/");
                });
            }
        )(req, res, next);
    }  
];

export const get_signup = [
    (req, res, next) => {
        if (req.isAuthenticated()) { return res.redirect("/"); }
        next();
    },
    (req, res) => {
        res.render("signup");
    }
];

export const post_signup = [
    (req, res, next) => {
        if (req.isAuthenticated()) { return res.redirect("/"); }
        next();
    },
    validator_username(),
    validator_password(),
    async (req, res, next) => {
        try { 
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).render("signup", { body: req.body, errors: errors.array() });
            }

            const { username, password } = matchedData(req);
            let user = await prisma.user.findFirst({ where: { username }});
            if (user) {
                return res.status(400).render("signup", { body: req.body, errors: [{ msg: "User already exists" }] });
            }
            const password_hash = await bcrypt.hash(password, 10);
            user = await prisma.user.create({
                data: {
                    username, 
                    password: password_hash,
                    folders: {
                        create: {
                            name: "root",
                            parentId: null
                        }
                    }
                }
            });
            if (!user) {
                return res.status(500).render("signup", { body: req.body, errors: [{ msg: "User creation error" }] });
            }

            res.redirect("/login");
        }
        catch (err) {
            console.log(err);
            next(err);
        }
    }  
];

export const get_update_folder = [
    (req, res, next) => {
        if (!req.isAuthenticated()) {
            return res.redirect("/login");
        }
        next();
    },
    param("id")
        .isInt({ min: 0 }).toInt(),
    async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.redirect("/folder");
        }
        const { id } = matchedData(req);
        const folder = await prisma.folder.findFirst({
            where: {
                id, user_id: req.user.id
            }
        });
        if (!folder) {
            return res.redirect("/folder");
        }
        return res.render("updateitem", { body: { name: folder.name }, title: "Update Folder", action: `/folder/${id}/update` });
    }
];

export const get_update_file = [
    (req, res, next) => {
        if (!req.isAuthenticated()) {
            return res.redirect("/login");
        }
        next();
    },
    param("id")
        .isInt({ min: 0 }).toInt(),
    async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.redirect("/folder");
        }
        const { id } = matchedData(req);
        const file = await prisma.file.findFirst({
            where: {
                id, user_id: req.user.id
            }
        });
        if (!file) {
            return res.redirect("/folder");
        }
        return res.render("updateitem", { body: { name: file.name }, title: "Update File", action: `/file/${id}/update` });
    }
];

export const post_update_folder = [
    (req, res, next) => {
        if (!req.isAuthenticated()) {
            return res.redirect("/login");
        }
        next();
    },
    param("id")
        .isInt({ min: 0 }).toInt(),
    body("name")
        .isLength({ min: 1, max: 100 }),
    async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.redirect("/folder");
        }
        const { id, name } = matchedData(req);

        try {
            const folder = await prisma.folder.findFirst({
                where: {
                    id, user_id: req.user.id
                }
            });
            if (!folder) {
                return res.redirect("/folder");
            }
            const updated_folder = await prisma.folder.update({
                where: {
                    id
                },
                data: {
                    name
                }
            });
            if (!updated_folder) {
                return res.redirect("/folder");
            }
            return res.redirect(`/folder/${folder.parentId}`);
        }
        catch (err) {
            next(err);
        }
    }
];

export const post_update_file = [
    (req, res, next) => {
        if (!req.isAuthenticated()) {
            return res.redirect("/login");
        }
        next();
    },
    param("id")
        .isInt({ min: 0 }).toInt(),
    body("name")
        .isLength({ min: 1, max: 100 }),
    async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.redirect("/folder");
        }
        const { id, name } = matchedData(req);

        try {
            const file = await prisma.file.findFirst({
                where: {
                    id, user_id: req.user.id
                }
            });
            if (!file) {
                return res.redirect("/folder");
            }
            const updated_file = await prisma.file.update({
                where: {
                    id
                },
                data: {
                    name
                }
            });
            if (!updated_file) {
                return res.redirect("/folder");
            }
            return res.redirect(`/folder/${file.folderId}`);
        }
        catch (err) {
            next(err);
        }
    }
];

export const get_share_folder = [
    (req, res, next) => {
        if (!req.isAuthenticated()) {
            return res.redirect("/login");
        }
        next();
    },
    param("id")
        .isInt({ min: 0 }).toInt(),
    async (req, res, next) => {
        const { id } = matchedData(req);

        try {
            const folder = await prisma.folder.findFirst({
                where: {
                    id: id, user_id: req.user.id
                }
            });
            if (!folder) {
                return res.redirect("/folder");
            }
            return res.render("sharefolder", { folder });
        }
        catch (err) {
            next(err);
        }
    }
];

export const post_share_folder = [
    (req, res, next) => {
        if (!req.isAuthenticated()) {
            return res.redirect("/login");
        }
        next();
    },
    body("date")
        .isISO8601().withMessage("Date has to follow the ISO format")
        .custom((value) => {
            const date = new Date(value);
            const now = new Date();

            const min = new Date(now);
            min.setHours(now.getHours());

            const max = new Date(now);
            max.setDate(now.getDate() + 365);

            if (date < min) {
                throw new Error("Date must be at least 1 hour from current time");
            }
            if (date > max) {
                throw new Error("Date must be less than a year in the future");
            }
            return true;
        }),
    param("id")
        .isInt({ min: 0 }).toInt(),
    async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.render("sharefolder", {
                body: req.body,
                errors: errors.array()
            });
        }

        let { id, date } = matchedData(req);
        date = new Date(date);

        try {
            const folder = await prisma.folder.findFirst({
                where: {
                    id
                }
            });
            if (!folder) {
                return res.redirect("/folder");
            }

            const new_folder = await prisma.folder.update({
                where: {
                    id
                },
                data: {
                    shared_until: date
                }
            });
            if (!new_folder) {
                return res.redirect("/folder");
            }
            const baseURL = `${req.protocol}://${req.get("host")}`;
            const link = `${baseURL}/share/folder/${id}`;
            return res.render("sharefolder", { folder, body: req.body, link });
        }        
        catch (err) {
            next(err);
        }
    }
];

export const get_shared_folder = [
    param("id")
        .isInt({ min: 0 }).toInt(),
    async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.redirect("/folder");
        }
        try {
            let { id } = matchedData(req);

            const orig_folder = await prisma.folder.findFirst({
                where: { id },
                include: {
                    children: true, files: true
                }
            });
            if (!orig_folder) {
                return res.redirect("/folder");
            }

            const now = new Date();
            let folder_shared = false;
            while (id) {
                const folder = await prisma.folder.findFirst({
                    where: { id }
                });
                if (folder.shared_until && folder.shared_until > now) {
                    folder_shared = true;
                    break;
                }
                id = folder.parentId;
            }
            if (!folder_shared) {
                return res.redirect("/folder");
            }
            return res.render("folder", { folder: orig_folder, share: true });
        }
        catch(err) {
            next(err);
        }
    }
];

export const get_shared_file = [
    param("id")
        .isInt({ min: 0 }).toInt(),
    async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.redirect("/folder");
        }
        try {
            let { id } = matchedData(req);
            const file = await prisma.file.findFirst({
                where: { id }
            });
            if (!file) {
                return res.redirect("/folder");
            }

            id = file.folderId;
            const now = new Date();
            let folder_shared = false;
            while (id) {
                const folder = await prisma.folder.findFirst({
                    where: { id }
                });
                if (folder.shared_until && folder.shared_until > now) {
                    folder_shared = true;
                    break;
                }
                id = folder.parentId;
            }
            if (!folder_shared) {
                return res.redirect("/folder");
            }
            return res.render("file", { file, share: true });
        }
        catch(err) {
            next(err);
        }
    }
];

export const download_file = [
    param("id")
        .isInt({ min: 0 }).toInt(),
    async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status("404").send("Not found");
        }

        try {
            const file = await prisma.file.findFirst({
                where: { id: req.params.id }
            });
            if (!file) {
                return res.status(404).send("Not found");
            }

            if (file.user_id !== req.user.id) {
                let id = user.folderId;
                let is_shared = false;
                const now = new Date();
                while (id) {
                    const folder = await prisma.folder.findFirst({
                        where: { id }
                    });
                    if (folder.shared_until && folder.shared_until > now) {
                        is_shared = true;
                        break;
                    }
                    id = folder.parentId;
                }
                if (!is_shared) {
                    return res.status(403).send("Forbidden");
                }
            }

            const { data, error } = await supabase.storage
                .from("files")
                .download(file.path);

            if (error) return res.status(404).send("Not found");

            const buffer = Buffer.from(await data.arrayBuffer());

            res.setHeader("Content-Disposition", `attachment; filename="${file.name}"`);
            res.send(buffer);
        }
        catch(err) {
            res.status(404).send("Not found");
        }
    }
];