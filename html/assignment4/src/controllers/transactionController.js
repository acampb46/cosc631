const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASSWORD,
    },
});

const transactionController = {
    async sendEmail(to, subject, text) {
        await transporter.sendMail({ from: process.env.EMAIL, to, subject, text });
    },
};