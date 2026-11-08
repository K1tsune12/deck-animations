// Rings clock: hours, minutes and seconds as glowing arcs around the time.

const box = Clock.Box();
const c1 = Clock.color( '#a64dff' );
const c2 = Clock.color2( '#33e6ff' );

const wrap = document.createElement( 'div' );
wrap.style.position = 'relative';
box.appendChild( wrap );

const canvas = document.createElement( 'canvas' );
canvas.style.display = 'block';
wrap.appendChild( canvas );
const ctx = canvas.getContext( '2d' );

const center = document.createElement( 'div' );
center.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center';
center.style.color = c1;
const time = document.createElement( 'div' );
const date = document.createElement( 'div' );
date.style.opacity = '0.7';
date.style.letterSpacing = '0.05em';
date.style.color = c2;
center.append( time );
if ( Clock.date )
    center.append( date );
wrap.appendChild( center );

let size = 0;
function Layout()
{
    size = Clock.Vmin( 56 * Clock.scale );
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round( size * dpr );
    canvas.height = Math.round( size * dpr );
    canvas.style.width = `${ size }px`;
    canvas.style.height = `${ size }px`;
    ctx.setTransform( dpr, 0, 0, dpr, 0, 0 );
    time.style.fontSize = `${ size * 0.17 }px`;
    date.style.fontSize = `${ size * 0.042 }px`;
    date.style.marginTop = `${ size * 0.03 }px`;
}
Layout();
addEventListener( 'resize', Layout );

function Ring( radius, width, fraction )
{
    const r = size / 2;
    const start = -Math.PI / 2;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = c1;
    ctx.beginPath();
    ctx.arc( r, r, radius, 0, Math.PI * 2 );
    ctx.stroke();
    if ( fraction <= 0 )
        return;
    const grad = ctx.createLinearGradient( 0, 0, size, size );
    grad.addColorStop( 0, c1 );
    grad.addColorStop( 1, c2 );
    ctx.globalAlpha = 1;
    ctx.strokeStyle = grad;
    ctx.beginPath();
    ctx.arc( r, r, radius, start, start + fraction * Math.PI * 2 );
    ctx.stroke();
}

function Draw( d )
{
    const unit = size / 100;
    ctx.clearRect( 0, 0, size, size );
    const s = d.getSeconds() + d.getMilliseconds() / 1000;
    const m = d.getMinutes() + s / 60;
    const h = ( d.getHours() % 12 ) + m / 60;
    Ring( size / 2 - unit * 3, unit * 1.6, h / 12 );
    Ring( size / 2 - unit * 7, unit * 1.2, m / 60 );
    if ( Clock.seconds )
        Ring( size / 2 - unit * 10.5, unit * 0.7, s / 60 );
    ctx.globalAlpha = 1;
}

const Capitalize = ( text ) => text.charAt( 0 ).toUpperCase() + text.slice( 1 );
Clock.EverySecond( ( d ) =>
{
    const p = Clock.Parts( d );
    time.textContent = p.hm + ( p.ampm ? ` ${ p.ampm }` : '' );
    date.textContent = Capitalize( p.date );
} );

if ( Clock.seconds )
    RunLoop( () => Draw( new Date() ) );
else
    Clock.EverySecond( Draw );

Clock.Drift( box );
