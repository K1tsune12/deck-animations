// Aurora clock: the time filled with a slowly flowing two-colour gradient.

const box = Clock.Box();
const c1 = Clock.color( '#a64dff' );
const c2 = Clock.color2( '#33e6ff' );

const style = document.createElement( 'style' );
style.textContent = `
@keyframes aurora { from { background-position: 0% 50%; } to { background-position: 300% 50%; } }
.aurora {
    background: linear-gradient(100deg, ${ c1 }, ${ c2 }, ${ c1 }, ${ c2 });
    background-size: 300% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    animation: aurora 40s linear infinite;
    padding: 0 0.05em;
}`;
document.head.appendChild( style );

const time = document.createElement( 'div' );
time.className = 'aurora';
box.appendChild( time );

const date = document.createElement( 'div' );
date.style.color = c2;
date.style.opacity = '0.65';
date.style.letterSpacing = '0.08em';
if ( Clock.date )
    box.appendChild( date );

function Layout()
{
    const s = Clock.scale;
    time.style.fontSize = `${ Clock.Vmin( 24 * s ) }px`;
    time.style.letterSpacing = '-0.01em';
    date.style.fontSize = `${ Clock.Vmin( 3.4 * s ) }px`;
    date.style.marginTop = `${ Clock.Vmin( 2 * s ) }px`;
}
Layout();
addEventListener( 'resize', Layout );

const Capitalize = ( text ) => text.charAt( 0 ).toUpperCase() + text.slice( 1 );
let started = false;
Clock.EverySecond( ( d ) =>
{
    const p = Clock.Parts( d );
    const text = p.hm + ( Clock.seconds ? `:${ p.s }` : '' ) + ( p.ampm ? ` ${ p.ampm }` : '' );
    if ( time.textContent !== text )
        time.textContent = text;
    date.textContent = Capitalize( p.date );
    if ( !started )
    {
        started = true;
        Clock.Drift( box );
    }
} );
