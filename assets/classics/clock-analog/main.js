// Analog clock: thin tick ring and hands, smooth accent second hand.

const box = Clock.Box();
const main = Clock.color( '#e8e8e8' );
const accent = Clock.color2( '#ff5a36' );

const canvas = document.createElement( 'canvas' );
canvas.style.display = 'block';
canvas.style.margin = '0 auto';
box.appendChild( canvas );
const ctx = canvas.getContext( '2d' );

const date = document.createElement( 'div' );
date.style.color = main;
date.style.opacity = '0.7';
date.style.letterSpacing = '0.06em';
if ( Clock.date )
    box.appendChild( date );

let size = 0;
function Layout()
{
    size = Clock.Vmin( 52 * Clock.scale );
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round( size * dpr );
    canvas.height = Math.round( size * dpr );
    canvas.style.width = `${ size }px`;
    canvas.style.height = `${ size }px`;
    ctx.setTransform( dpr, 0, 0, dpr, 0, 0 );
    date.style.fontSize = `${ Clock.Vmin( 3.2 * Clock.scale ) }px`;
    date.style.marginTop = `${ Clock.Vmin( 2.5 * Clock.scale ) }px`;
}
Layout();
addEventListener( 'resize', Layout );

function Hand( angle, length, width, color )
{
    const r = size / 2;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo( r - Math.sin( angle ) * length * 0.12, r + Math.cos( angle ) * length * 0.12 );
    ctx.lineTo( r + Math.sin( angle ) * length, r - Math.cos( angle ) * length );
    ctx.stroke();
}

function Draw( d )
{
    const r = size / 2;
    const unit = size / 100;
    ctx.clearRect( 0, 0, size, size );

    for ( let i = 0; i < 60; i++ )
    {
        const hour = i % 5 === 0;
        const a = ( i / 60 ) * Math.PI * 2;
        const outer = r - unit * 2;
        const inner = outer - ( hour ? unit * 6 : unit * 2.2 );
        ctx.strokeStyle = main;
        ctx.globalAlpha = hour ? 0.9 : 0.35;
        ctx.lineWidth = hour ? unit * 0.9 : unit * 0.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo( r + Math.sin( a ) * inner, r - Math.cos( a ) * inner );
        ctx.lineTo( r + Math.sin( a ) * outer, r - Math.cos( a ) * outer );
        ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const ms = d.getMilliseconds();
    const s = d.getSeconds() + ms / 1000;
    const m = d.getMinutes() + s / 60;
    const h = ( d.getHours() % 12 ) + m / 60;
    Hand( ( h / 12 ) * Math.PI * 2, r * 0.5, unit * 2.2, main );
    Hand( ( m / 60 ) * Math.PI * 2, r * 0.76, unit * 1.4, main );
    if ( Clock.seconds )
        Hand( ( s / 60 ) * Math.PI * 2, r * 0.84, unit * 0.6, accent );

    ctx.fillStyle = Clock.seconds ? accent : main;
    ctx.beginPath();
    ctx.arc( r, r, unit * 1.6, 0, Math.PI * 2 );
    ctx.fill();
}

const Capitalize = ( text ) => text.charAt( 0 ).toUpperCase() + text.slice( 1 );
Clock.EverySecond( ( d ) => { date.textContent = Capitalize( Clock.Parts( d ).date ); } );

// smooth seconds need frames; without them, once a second is plenty
if ( Clock.seconds )
    RunLoop( () => Draw( new Date() ) );
else
    Clock.EverySecond( Draw );

Clock.Drift( box );
