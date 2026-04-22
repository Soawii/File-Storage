import passport from "passport";
import { Strategy } from "passport-local"
import prisma from "../lib/prisma.js";
import bcrypt from "bcrypt";

export default () => {
    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    passport.deserializeUser(async (id, done) => {
        try {
            const user = await prisma.user.findUnique({
                where: { id }
            });
            if (!user) {
                return done(null, false, { message: "Invalid user ID" });
            }
            return done(null, user);
        }
        catch (err) {
            return done(err);
        }
    });

    passport.use(new Strategy(async (username, password, done) => {
        try {
            const user = await prisma.user.findUnique({
                where: { username }
            });
            if (!user) {
                return done(null, false, { message: "Incorrect username" });
            }
            const match = await bcrypt.compare(password, user.password);
            if (!match) {
                return done(null, false, { message: "Incorrect password" });
            }
            return done(null, user);
        }
        catch (err) {
            return done(err);
        }
    }));
}