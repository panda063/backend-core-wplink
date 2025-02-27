const mailStyle = `
<head>
<style>
@media(max-width:1400px){
	.main{
    	padding: 20px 25%;
    }
}
@media(max-width:900px){
	.main{
    	padding: 20px 100px;
    }
}

@media(max-width:650px){
	.main{
    	padding: 20px 50px;
    }
}

@media(max-width:500px){
	.main{
    	padding: 20px 20px;
    }
}
table.center {
    margin-left: auto; 
    margin-right: auto;
}
th, td {
    padding: 10px;
}
</style>
</head>
`;

const mailFooter = `
<br><br>
<p>Thank you,<br>
Team passionbits</p>

`;

exports.caution_email = (name, reason) => {
    return `
    ${mailStyle}
    <body>
    <div class="main">
        <p>Hi ${name},</p>
        
        <p>Caution Reason : ${reason}</p>
        ${mailFooter}
    </div>
    </body>
    `;
};

exports.ban_email = (name, reason) => {
    return `
    ${mailStyle}
    <body>
    <div class="main">
        <p>Hi ${name},</p>
        
        <p>Ban Reason : ${reason}</p>
        ${mailFooter}
    </div>
    </body>
    `;
};

exports.job_on_hold_email = (name, title) => {
    return `
    ${mailStyle}
    <body>
    <div class="main">
        <p>Hi ${name},</p>
        
        <p>Job ${title} has been but on hold</p>
        ${mailFooter}
    </div>
    </body>
    `;
};

exports.writerEmpanelement = ({ email, firstName, link }) => {
    return `
    <body class="main">
    Hi ${firstName},
    <br />
    <br />
    Your Freelancing is about to get a whole lot better in 2022.<br /><br />
    Why?<br /><br />
    You provided us with details of your experience and your content samples. Now we're giving back a platform to monetize them. <br /><br />
    Yes, we made a portfolio but more than that, you can list your services right away, set your price and get paid the way you want.<br /><br />
    From communicating with potential clients to getting paid, you can map your Freelance journey easily in your mobile.<br /><br />
    Here's your login credentials:<br />
    Link: <a href="https://passionbits.io/login">Passionbits</a> <br />
    Username: ${email} <br />
    Password: passionbits <br /><br />
    You can change your Password anytime through this link: <a href="${link}"> Click Here </a> <br /><br />
    Thank you for being a part of Passionbits community. We're excited to see you monetize your talent. <br /><br />
    Creators create! <br />
    From Team Passionbits<br />
    </body>
  `;
};

exports.writerEmpanelement2 = ({ firstName }) => {
    return `
    <body class="main">
    Hi ${firstName}, <br />
    <br />
    We noticed you haven’t made any changes to the portfolio. Please let us know if you have trouble logging into your account or unable to tweak your portfolio.
    <br />
    <br />
    You can reach out to us anytime if you need more information on how to use your portfolio to get clients or manage projects, etc. <br />
    <a href="https://calendly.com/ishanpassionbits/30min">https://calendly.com/ishanpassionbits/30min</a> <br />
    <a href="https://calendly.com/neelesh-passionbits/30min">https://calendly.com/neelesh-passionbits/30min</a> <br /><br />
    Cheers! <br />
    Team Passionbits
    </body>
  `;
};
