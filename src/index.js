const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const mustacheExpress = require('mustache-express');
const crypto = require('crypto');
const logic = require('./logic');
const authTokens = {};
const { Pool } = require('pg');
const data = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'mrcoffee-login',
    password: '',
    port: 5430,
});
const app = express();
const port = 5000;

const generateAuthToken = () => {
    return crypto.randomBytes(30).toString('hex');
};

const getHashedPassword = (password) => {
    const sha256 = crypto.createHash('sha256');
    return sha256.update(password).digest('base64');
};

app.set('views', `${__dirname}/../views`);
app.set('view engine', 'mustache');
app.engine('mustache', mustacheExpress());

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());

app.use('/static', express.static('static'));
app.use('/static/assets', express.static('static'));

app.use((req, res, next) => {
    const authToken = req.cookies['AuthToken'];
    req.user = authTokens[authToken];
    next();
});

app.get('/', async (req, res) => {
    if (!req.user) {
        res.render("login", { 'title': 'Please login to continue' });
        return;
    };

    const usersInfo = (await data.query
        (`SELECT sch_id, day, start_at, end_at, id, firstname, lastname 
        FROM schedules 
        FULL OUTER JOIN users 
        ON schedules.user_id = users.id`)).rows;

    for (let i = 0; i < usersInfo.length; i++) {
        let fullName = `${usersInfo[i].firstname} ${usersInfo[i].lastname}`;
        let id = usersInfo[i].id;
        let link = `/user/${id}`;

        if (usersInfo[i].sch_id < 1) {
            usersInfo[i].user_id = fullName;
            usersInfo[i].day = 'NO SCHEDULE';
            usersInfo[i].start_at = '-';
            usersInfo[i].end_at = '-';
            usersInfo[i].userLink = link;
        } else {
            let dayNumber = usersInfo[i].day;
            let daysStr = logic.getDayName(dayNumber);
            let start = usersInfo[i].start_at.slice(0, 5);
            let end = usersInfo[i].end_at.slice(0, 5);
            usersInfo[i].day = daysStr;
            usersInfo[i].user_id = fullName;
            usersInfo[i].start_at = start;
            usersInfo[i].end_at = end;
            usersInfo[i].userLink = link;
        };
    };

    res.render('homepage', { 'schedule': usersInfo });
});

app.route('/login')
    .get(async (req, res, next) => {
        res.render('login', { 'title': 'Login to continue' });
    })
    .post(async (req, res, next) => {
        const { email, password } = req.body;
        const hashedPassword = getHashedPassword(password);
        const userBD = (await data.query(`SELECT * FROM users WHERE email = '${email}'`)).rows;

        if (userBD.length === 0) {
            res.render('login', { 'title': 'Login to continue', 'msg': 'The username or password you entered is incorrect.' });
            return;
        } else {
            const passwordBD = userBD[0].password;

            if (passwordBD !== hashedPassword) {
                res.render('login', { 'title': 'Login to continue', 'msg': 'The username or password you entered is incorrect.' });
                return;
            };
        };

        const authToken = generateAuthToken();
        authTokens[authToken] = userBD;
        res.cookie('AuthToken', authToken);

        res.redirect('/');
    });

app.route('/signup')
    .get(async (req, res, next) => {
        res.render('signup');
    })
    .post(async (req, res, next) => {
        const { email, firstname, lastname, password, repeatPassword } = req.body;
        const users = (await data.query('SELECT * FROM users;')).rows;

        if (users.find(user => user.email === email)) {
            res.render('signup', { 'msg': 'The email address already exists in our database.' });
            return;
        };

        if (password !== repeatPassword) {
            res.render('signup', { 'msg': 'Passwords do not match.' });
            return;
        };

        const hashedPassword = getHashedPassword(password);
        await data.query
            (`INSERT INTO users (firstname, lastname, email, password) 
        VALUES ('${firstname}', '${lastname}', '${email}', '${hashedPassword}')`);

        res.render('login', { 'title': 'Registration Complete. Please login to continue.' });
    });

app.route('/new-schedule')
    .get(async (req, res) => {
        if (!req.user) {
            res.render("login", { 'title': 'Please login to continue' });
            return;
        };

        const loggedUserId = req.user[0].id;
        const userInfo = (await data.query(
            `SELECT firstname, lastname, email 
            FROM users 
            WHERE users.id = '${loggedUserId}'`)).rows;

        const userSch = (await data.query(`SELECT * FROM schedules WHERE schedules.user_id = '${loggedUserId}'`)).rows

        if (userSch.length < 1) {
            res.render('form-schedule', { 'users': userInfo, 'yourSch': `You haven't added any schedules yet !` });
            return;
        };

        for (let i = 0; i < userSch.length; i++) {
            userSch[i].day = logic.getDayName(userSch[i].day);
            userSch[i].start_at = userSch[i].start_at.slice(0, 5);
            userSch[i].end_at = userSch[i].end_at.slice(0, 5);
        };

        res.render('form-schedule', { 'users': userInfo, 'yourSch': 'Your work schedules:', 'schedule': userSch });
    })
    .post(async (req, res) => {
        if (!req.user) {
            res.render("login", { 'title': 'Please login to continue' });
            return;
        };

        const { day, start_at, end_at, ampm } = req.body;
        const newSchedule =
            `INSERT INTO schedules (user_id, day, start_at, end_at) 
            VALUES ('${req.user[0].id}', '${parseInt(day)}', '${start_at} ${ampm[0]}', '${end_at} ${ampm[1]}') 
            RETURNING *;`;

        await data.query(newSchedule);
        res.redirect('/new-schedule');
    });

app.route('/user/:id')
    .get(async (req, res) => {
        if (!req.user) {
            res.render("login", { 'title': 'Please login to continue' });
            return;
        };

        const userId = parseInt(req.params.id);
        const users = (await data.query(`SELECT * FROM users WHERE id=${userId}`)).rows;
        const usersIds = (await data.query('SELECT id FROM users')).rows;

        let ids = usersIds.flatMap(function (e) {
            return Object.values(e);
        });

        const userSchedule = (await data.query(`SELECT * FROM schedules WHERE user_id=${userId}`)).rows;
        const fullNames = (await data.query(`SELECT firstname, lastname FROM users WHERE id=${userId}`)).rows;

        if (userSchedule.length < 1) {
            res.render('user-page', {
                'title': `${fullNames[0].firstname} ${fullNames[0].lastname} information`,
                'yourSch': `You haven't added any schedules yet !`,
                'user': users
            });
            return;
        };

        const idValid = logic.isIdValid(userId, ids, res);
        if (idValid) {

            for (let i = 0; i < userSchedule.length; i++) {
                let dayNumber = userSchedule[i].day;
                let daysStr = logic.getDayName(dayNumber);
                let start = userSchedule[i].start_at.slice(0, 5);
                let end = userSchedule[i].end_at.slice(0, 5);
                userSchedule[i].day = daysStr;
                userSchedule[i].start_at = start;
                userSchedule[i].end_at = end;
            };

            res.render('user-page', {
                'title': `${fullNames[0].firstname} ${fullNames[0].lastname} information`,
                'yourSch': 'Work schedule:',
                'user': users, 'schedule': userSchedule
            });
        };
    });

app.get('/logout', (req, res) => {
    const authToken = req.cookies['AuthToken'];
    delete authTokens[authToken];
    res.clearCookie('AuthToken');
    res.render("login", { 'title': 'You have been successfully logged out' });
});

app.listen(port,
    () => {
        console.log(`http://localhost:${port}`)
    });
