import express from "express";
import session from "express-session";
import passport from "passport";
import passport_init from "./passport/passport.js";
import router_index from "./routes/index.js";
import prisma from "./lib/prisma.js";
import { PrismaSessionStore } from '@quixo3/prisma-session-store';
import multer from "multer";

passport_init();

const app = express();

app.locals.toLocalDatetimeValue = function(date) {
    const pad = (n) => String(n).padStart(2, "0");

    return date.getFullYear() + "-" +
        pad(date.getMonth() + 1) + "-" +
        pad(date.getDate()) + "T" +
        pad(date.getHours()) + ":" +
        pad(date.getMinutes());
};

app.set("view engine", "ejs");

app.use(
    session({
        cookie: {
            maxAge: 7 * 24 * 60 * 60 * 1000 // ms
        },
        secret: process.env.SECRET,
        resave: true,
        saveUninitialized: true,
        store: new PrismaSessionStore(
            prisma,
            {
                checkPeriod: 2 * 60 * 1000,  //ms
                dbRecordIdIsSessionId: true,
                dbRecordIdFunction: undefined,
            }
        )
    })
);
app.use(passport.session());
app.use((req, res, next) => {
    res.locals.currentUser = req.user;
    next();
});
app.use(express.static("public"));
app.use(express.urlencoded());

app.use("/", router_index);

app.use((req, res) => {
    res.render("error", { message: "404 - Not found" });
});

app.use((err, req, res, next) => {
    console.error(err);
    res.render("error", { message: err });
});

app.listen(3000, (err) => {
    if (err) {
        console.log(err);
    }
    else {
        console.log("Server started!");
    }
});