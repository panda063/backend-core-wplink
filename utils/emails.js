const { log } = require('debug');
const env = require('../config/env');

function ordinal(number) {
    const english_ordinal_rules = new Intl.PluralRules('en', {
        type: 'ordinal',
    });
    const suffixes = {
        one: 'st',
        two: 'nd',
        few: 'rd',
        other: 'th',
    };
    const suffix = suffixes[english_ordinal_rules.select(number)];
    return number + suffix;
}

const buttonLink = (url, displayText) => {
    return `
		<div style="text-align: center; padding: 20px 0">
			<a 
				href="${url}"
				style="background: linear-gradient(96.52deg, #0038FF 5.28%, #FF3D00 95.54%);
                    border-radius: 10px;color: white;
                    padding: 20px 50px;font-size: 1rem; font-weight: 700;text-decoration: none;"
			>
				${displayText}
			</a>
		</div>
	`;
};

const underlineLink = (url, displayText) => `
<a style="color:red;text-decoration: underline;" href="${url}">${displayText}</a>   
`;

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

exports.creator_endpoint = 'https://passionbits.io/creator/';
exports.creator_endpoint_dashboard =
    'https://passionbits.io/creator/dashboard/';

exports.creator_endpoint_local = 'http://local.passionbits.io:3000/creator/';
exports.creator_endpoint_dashboard_local =
    'http://local.passionbits.io:3000/creator/dashboard/';

exports.client_endpoint = 'https://passionbits.io/';
exports.client_endpoint_dashboard = 'https://passionbits.io/dashboard/';

exports.client_endpoint_local = 'http://local.passionbits.io:3000/';
exports.client_endpoint_dashboard_local =
    'http://local.passionbits.io:3000/dashboard/';

exports.creator_register_reminder_mail = () => {
    return `
    ${mailStyle}
    <body>
    <div class="main">
        <p>Hi Passionate,</p>
        
        <p>Let us know more about you and get early access to passionbits. There are exciting perks - a guaranteed project, access to the community of design leaders, etc.</p>
        <p>${underlineLink(
            this.creator_endpoint,
            'Click here',
        )} to know more.</p>
        ${mailFooter}
    </div>
    </body>
    `;
};

exports.creator_registration_complete_mail = (name, position, token) => {
    return `
    ${mailStyle}
    <body>
    <div class="main">
        <p>Hi ${name},</p>
        
        <p>Congratulations! You have been rewarded with 100 bits for successfully joining the early access waitlist.</p>
        <p>You are now on ${ordinal(
            position,
        )} position on the waitlist for early access. You can bump up on the waitlist and also get access to two other awesome perks using the bits.</p>
        ${buttonLink(
            `${this.creator_endpoint}verify/${token}`,
            'Claim 100 bits ',
        )}
        ${mailFooter}
    </div>
    </body>
    `;
};

exports.creator_verification_reminder_42 = (name, position, token) => {
    return `
    ${mailStyle}
<body>
<div class="main">
        <p>Hi ${name},</p>
        <p>
        You are on ${ordinal(
            position,
        )} position on our waitlist. Don't worry, you can jump up in the
line and also earn some really good perks by collecting BITS which is a virtual
currency on Passionbits. By collecting bits you can be a guest writer on our
platform, get an expert help to build your portfolio and earn many more cool perks. Please claim your 100 bits and get on the dashboard to know about the perks that we are offering you.
        </p>
        <br>
        <br>
        ${buttonLink(
            `${this.creator_endpoint}verify/${token}`,
            'Claim 100 bits💰',
        )}
        ${mailFooter}
    </div>
</body>
    `;
};

exports.creator_verification_reminder_72 = (name, token) => {
    return `
    ${mailStyle}
<body>
<div class="main">
        <p>Hi ${name},</p>
        <p>You haven't checked your dashboard yet. Please claim your 100 bits to visit the dashboard and get access to cool perks.</p>
        <p>-Guaranteed project for first 1000 users. Become a beta user on passionbits and
        be ahead of the competition.</p>
        <p>-Strong support system consisting of Coaches, Mentors, Peers and people who can help navigate the professional journey and to help you to upskill.</p>
        <p>-Permanent listing on our investor and thank you page with a link to your portfolio
        and your profile.</p>
        <br>
        <br>
        ${buttonLink(
            `${this.creator_endpoint}verify/${token}`,
            'Claim 100 bits💰',
        )}
        ${mailFooter}
    </div>
</body>
    `;
};

exports.creator_perk_1_reminder_42 = (name) => {
    return `
    ${mailStyle}
<body>
<div class="main">
        <p>Hi ${name},</p>
        <p>You have an opportunity to get a guaranteed project on passionbits. Being an early user on passionbits you have been eligible for this opportunity. Checkout your dashboard to know more.</p>
        <p>${underlineLink(
            this.creator_endpoint_dashboard,
            'Click here',
        )} to visit your dashboard.<p>
        ${mailFooter}
    </div>
</body>
    `;
};

exports.creator_perk_1_reminder_72 = (name, remainingSlots) => {
    return `
    ${mailStyle}
<body>
<div class="main">
        <p>Hi ${name},</p>
        <p>Here's how you can get your guaranteed project on Passionbits.</p>
        <p>Take a quick survey and earn 100 more bits.<br>
        Use your bits that you have earned to buy the perk.<br>
        Guaranteed project for the first 1000 beta users.
        </p>
        <p>There are only ${remainingSlots} slots remaining to become an early user and to get a guaranteed project. Visit your dashboard to know more.</p>
        
        <p>${underlineLink(
            this.creator_endpoint_dashboard,
            'Click here',
        )} to visit your dashboard.<p>
        ${mailFooter}
    </div>
</body>
    `;
};

exports.creator_perk_2_reminder_42 = (name) => {
    return `
    ${mailStyle}
<body>
<div class="main">
        <p>Hi ${name},</p>
        <p>You have access to get your portfolio reviewed and to get an access to our strong support system consisting of Coaches, Mentors, Peers and people who can help navigate the professional journey and to help you to upskill.</p>
        <p>You can get access to the perk by inviting two of your friends and sharing passionbits on social media. Log in to your dashboard to know more.</p>
        
        <p>${underlineLink(
            this.creator_endpoint_dashboard,
            'Click here',
        )} to visit your dashboard.<p>
        ${mailFooter}
    </div>
</body>
    `;
};

exports.creator_perk_2_reminder_72 = (name) => {
    return `
    ${mailStyle}
<body>
<div class="main">
        <p>Hi ${name},</p>
        <p>Two more perks are waiting for you on your dashboard. Get your portfolio reviewed and to get access to our strong support system consisting of Coaches, Mentors, Peers and people who can help navigate the professional journey and to help you to upskill. Login to your dashboard to know more.</p>
        
        <p>${underlineLink(
            this.creator_endpoint_dashboard,
            'Click here',
        )} to visit your dashboard.<p>
        ${mailFooter}
    </div>
</body>
    `;
};

exports.creator_perk_2_reminder_week = (name, remainingSlots) => {
    return `
    ${mailStyle}
<body>
<div class="main">
        <p>Hi ${name},</p>
        <p>There are only ${remainingSlots} remaining on passionbits to access the perks. Log in to your dashboard soon to know more.</p>
        
        <p>${underlineLink(
            this.creator_endpoint_dashboard,
            'Click here',
        )} to visit your dashboard.<p>
        ${mailFooter}
    </div>
</body>
    `;
};

exports.creator_perk_3_reminder_42 = (name) => {
    return `
    ${mailStyle}
<body>
<div class="main">
        <p>Hi ${name},</p>
        <p>We appreciate your efforts in the community. We thank you for getting creators on our platform through your referral. You can get yourself permanently listed on our investor and thank you page and also get access to a 20000+ audience and a private slack community of founders and creative leaders.</p>
        
        <p>${underlineLink(
            this.creator_endpoint_dashboard,
            'Click here',
        )} to visit your dashboard.<p>
        ${mailFooter}
    </div>
</body>
    `;
};

exports.creator_perk_3_reminder_72 = (name) => {
    return `
    ${mailStyle}
<body>
<div class="main">
        <p>Hi ${name},</p>
        <p>You are very close to accessing the final perk. You will be in a private community of founders and creative leaders. You can also access an audience of 20000+ creators.</p>
        
        <p>${underlineLink(
            this.creator_endpoint_dashboard,
            'Click here',
        )} to visit your dashboard.<p>
        ${mailFooter}
    </div>
</body>
    `;
};

exports.creator_perk_3_reminder_week = (name, remainingSlots) => {
    return `
    ${mailStyle}
<body>
<div class="main">
        <p>Hi ${name},</p>
        <p>There are only ${remainingSlots} slots for creators to access this perk and you are on the top 100 creators on our platform. Visit your dashboard to know more.</p>
        
        <p>${underlineLink(
            this.creator_endpoint_dashboard,
            'Click here',
        )} to visit your dashboard.<p>
        ${mailFooter}
    </div>
</body>
    `;
};

exports.creator_invitation_mail = (inviterName, userRef) => {
    return `
    ${mailStyle}
<body>
<div class="main">
        <p>Hi Passionate,</p>
        <p>Congratulations! You have received an invite from your friend ${inviterName} to join
        passionbits early access program. Passiobits is an online community of freelancers with a strong belief in the creator first model. Join the waitlist now to get early access to the open platform.</p>
        <p>${underlineLink(
            `${this.creator_endpoint}${userRef}`,
            'Click here',
        )} to join passionbits early access program</p>
        ${mailFooter}
    </div>
</body>
    `;
};

exports.creator_join_friend_mail = (name, friendName, url) => {
    return `
    ${mailStyle}
<body>
<div class="main">
        <p>Hi ${name},</p>
        <p>We are happy that your friend ${friendName} has joined passionbits using your refferral link. In return we are rewarding you with 100 bits. Click on the link below to visit your dashboard to avail the perks.</p>
        <p>${underlineLink(
            this.creator_endpoint_dashboard,
            'Click here',
        )} to visit your dashboard</p>
        ${mailFooter}
    </div>
</body>
    `;
};

exports.creator_reset_password_mail = (token) => {
    return `
    ${mailStyle}
<body>
<div class="main">
        <p>Hi Passionate,</p>
        <p>Tap the button below to reset your customer account password. If you didn't request a new password, you can safely delete this email.</p>
        ${underlineLink(
            `${this.creator_endpoint}reset-password/${token}`,
            'Reset Password',
        )}
        ${mailFooter}
    </div>
</body>
    `;
};

exports.creator_marketing_join_waitlist_mail = () => {
    return `
    ${mailStyle}
<body>
<div class="main">
        <p>Hi Passionate,</p>
        <p>We will be closing the early access program on passionbits shortly. There are only a few
        slots remaining. Join the waitlist today and be among the early users of the platform and
        get exciting perks to boost your freelance career.
        </p>
        <p>${underlineLink(
            this.creator_endpoint,
            'Click here',
        )} to join passionbits early access program</p>
        ${mailFooter}
    </div>
</body>
    `;
};

// CLIENT MAILS

exports.client_not_registered_mail = () => {
    return `
    ${mailStyle}
    <body>
    <div class="main">
            <p>Hi Passionate,</p>
            <p>You have signed up on passionbits and you are yet to fill in the details to get a free subscription to post jobs for 1 year.</p>
            <p>${underlineLink(
                `${this.client_endpoint}`,
                'Click here',
            )} to know more</p>
            ${mailFooter}
        </div>
    </body>`;
};

exports.client_after_registration_mail = (name) => {
    return `
    ${mailStyle}
    <body>
    <div class="main">
            <p>Hi ${name},</p>
            <p>
            You have been awarded with one year of free subscription on passionbits.
            Our team members are working hard to build the product and launch it soon.
            You will be able to post jobs for free for a duration of 1 year. We’ll notify you
            shortly once we have set up the platform.
            </p>
            ${mailFooter}
        </div>
    </body>`;
};

exports.client_verification_reminder_mail = (token, name) => {
    return `
    ${mailStyle}
    <body>
    <div class="main">
            <p>Hi ${name},</p>
            <p>You can click on the link below to claim a one year subscription on passionbits for free.</p>
            ${buttonLink(
                `${this.client_endpoint}verify/${token}`,
                'Claim 1 year',
            )}
            ${mailFooter}
        </div>
    </body>`;
};

exports.client_after_verification_mail = (token, name) => {
    return `
    ${mailStyle}
    <body>
    <div class="main">
            <p>Hi ${name},</p>
            <p>You have already earned a one year subscription for free. You can earn more by visiting your dashboard on passionbits.</p>
            <p>${underlineLink(
                `${this.client_endpoint_dashboard}${token}`,
                'Click here',
            )} to visit your dashboard.</p>
            ${mailFooter}
        </div>
    </body>`;
};

exports.client_invite_friends_mail = (userRef, inviterName) => {
    return `
    ${mailStyle}
    <body>
    <div class="main">
            <p>Hi Passionate,</p>
            <p>
            You have been invited by your friend ${inviterName} to join the waitlist on passionbits.
Click on the below link to get one year of subscription to post jobs for
free on passionbits.
            </p>
            <p>${underlineLink(
                `${this.client_endpoint}${userRef}`,
                'Click here',
            )} to know more</p>
            ${mailFooter}
        </div>
    </body>`;
};

exports.client_join_friend_mail = (userToken, name) => {
    return `
    ${mailStyle}
    <body>
    <div class="main">
            <p>Hi ${name},</p>
            <p>
            You have been awarded with 3 more months subscription for free on passionbits as
            your friend has joined passionbits through your referral.            
            </p>
            <p>${underlineLink(
                `${this.client_endpoint_dashboard}${userToken}`,
                'Click here',
            )} to check your total months of free subscription</p>
            ${mailFooter}
        </div>
    </body>`;
};

const twitter_link = (ref) => {
    return `http://twitter.com/intent/tweet?text=this is for passionBit&url=https://passionbits.io/shr/bsns/t/${ref}&hashtags=passionbits,followPasstion`;
};

const linkedIn_link = (ref) => {
    return `https://www.linkedin.com/shareArticle?mini=true&url=https://passionbits.io/shr/bsns/l/${ref}&title=this%20is%20title&summary=this%20is%20from%20passion%20bits`;
};

const facebook_link = (ref) => {
    return `https://www.facebook.com/sharer/sharer.php?u=https://passionbits.io/shr/bsns/f/${ref}%2F&display=popup&ref=plugin&src=share_button&quote=this is from passionbits`;
};

exports.client_social_reminder_mail = (name, ref) => {
    return `
    ${mailStyle}
    <body>
    <div class="main">
            <p>Hi ${name},</p>
            <p>You can easily earn 1 month of additional free subscription
            by sharing us on your social media.
            </p>
            <p>Click on the below links to share on your social media</p>
            <p>${underlineLink(
                twitter_link(ref),
                'twitter',
            )}             ${underlineLink(
        linkedIn_link(ref),
        'linkedin',
    )}            ${underlineLink(facebook_link(ref), 'instagram')}</p>
            ${mailFooter}
        </div>
    </body>`;
};

// *******For Admin*************

exports.for_admin_creator_registration_complete_mail = (user) => {
    return `
    ${mailStyle}
    <body class="main">
      <p>${user.penname} has registered. </p>
      <br />
      <table class="center">
      <tr>
        <td>Email</td>
        <td>${user.e}</td>
      </tr>
      <tr>
        <td>Portfolio</td>
        <td><a href="${env.FRONTEND_URL}/${user.pn}">Click to visit</a></td>
      </tr>
      <tr>
        <td>Country</td>
        <td>${user.adr.co}</td>
      </tr>
      <tr>
        <td>City</td>
        <td>${user.adr.ci}</td>
      </tr>
      <tr>
        <td>Designation</td>
        <td>${user.pdg}</td>
      </tr>
      <tr>
        <td>Creator Type</td>
        <td>${user.cty}</td>
      </tr>
      <tr>
        <td>Signup Medium</td>
        <td>${user.sim}</td>
      </tr>
      <tr>
        <td>Referrer</td>
        <td>${user.rfr}</td>
      </tr>
      </table>
    </body>
  `;
};

exports.for_admin_client_after_registration_mail = (user) => {
    return `
    ${mailStyle}
    <body class="main">
      <p>A Client has registered. </p>
      <br />
      <table class="center">
      <tr>
        <td>Email</td>
        <td>${user.e}</td>
      </tr>
      <tr>
        <td>First Name</td>
        <td>${user.n.f}</td>
      </tr>
      <tr>
        <td>Last Name</td>
        <td>${user.n.l}</td>
      </tr>
      <tr>
        <td>Industry</td>
        <td>${user.ind}</td>
      </tr>
      <tr>
        <td>Website</td>
        <td>${user.wbs}</td>
      </tr>
      </table>
    </body>
  `;
};

exports.job_post_to_admin = (job, client) => {
    return `
    ${mailStyle}
    <body class="main">
      <p>A new opportunity has been posted </p>
      <br />
      <table class="center">
      <tr>
        <td>Title</td>
        <td>${job.title}</td>
      </tr>
      <tr>
        <td>Country</td>
        <td>${job.country}</td>
      </tr>
      <tr>
      <td>Client Name</td>
      <td>${client.fullname}</td>
    </tr>
      </table>
    </body>
  `;
};
