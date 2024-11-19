const nodemailer = require('nodemailer');
const twilio = require('twilio');
require('dotenv').config();

const emailTransporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
    },
});

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

module.exports = {
    sendEmail: async (to, subject, text) => {
        await emailTransporter.sendMail({
            from: process.env.EMAIL_USERNAME,
            to,
            subject,
            text,
        });
    },

    sendTextMessage: async (to, text) => {
        await twilioClient.messages.create({
            body: text,
            from: process.env.TWILIO_PHONE_NUMBER,
            to,
        });
    },
};