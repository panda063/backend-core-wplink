/*
 * JWT Methods
 * *ExpiresIn should be in Seconds
 */
const jwt = require('jsonwebtoken');
const { promisify } = require('util');

// TODO: remove JWT_SECRET dependency on .env file

// const VERIF_EMAIL_TOKEN_EXPIRESIN = 60 * 60;
const VERIF_EMAIL_TOKEN_EXPIRESIN = 3 * 60;

const sign = promisify(jwt.sign);
const verify = promisify(jwt.verify);

const generateVerifEamilToken = async ({ data }) => {
    const token = await sign({ data }, process.env.JWT_SECRET, {
        expiresIn: VERIF_EMAIL_TOKEN_EXPIRESIN,
    });
    return token;
};

const validateVerifEmailToken = async ({ token }) => {
    const decoded = await verify(token, process.env.JWT_SECRET);
    return decoded;
};

const generateToken = async ({ data, expiresIn }) => {
    let token;
    if (expiresIn) {
        token = await sign({ data }, process.env.JWT_SECRET, {
            expiresIn,
        });
    } else {
        token = await sign({ data }, process.env.JWT_SECRET);
    }
    return token;
};

const validateToken = async ({ token }) => {
    const decoded = await verify(token, process.env.JWT_SECRET);
    return decoded;
};

module.exports = {
    generateVerifEamilToken,
    validateVerifEmailToken,
    generateToken,
    validateToken,
};

// generateVerifEamilToken({ data: { hello: 'hello' } })
//   .then((token) => {
//     console.log('token --> ', token);
//     return setTimeout(
//       () => validateVerifEmailToken({ token })
//         .then(decoded => console.log('decoded --> ', decoded))
//         .catch(err => console.log('err --> ', err)),
//       6 * 1000,
//     );
//   })
//   .catch(err => console.log('err --> ', err));
