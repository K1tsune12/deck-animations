// Digital clock: large time with the date below, drifting on a black screen.

const box = Clock.Box();
box.style.color = Clock.color( '#ffffff' );

const time = document.createElement( 'div' );
const hm = document.createElement( 'span' );
const sec = document.createElement( 'span' );
const ampm = document.createElement( 'span' );
sec.style.opacity = '0.6';
ampm.style.opacity = '0.6';
time.append( hm, sec, ampm );
box.appendChild( time );

const date = document.createElement( 'div' );
date.style.opacity = '0.75';
date.style.letterSpacing = '0.06em';
if ( Clock.date )
    box.appendChild( date );

function Layout()
{
    const s = Clock.scale;
    time.style.fontSize = `${ Clock.Vmin( 21 * s ) }px`;
    time.style.letterSpacing = '-0.02em';
    sec.style.fontSize = '0.36em';
    sec.style.marginLeft = '0.12em';
    ampm.style.fontSize = '0.3em';
    ampm.style.marginLeft = '0.2em';
    date.style.fontSize = `${ Clock.Vmin( 3.6 * s ) }px`;
    date.style.marginTop = `${ Clock.Vmin( 2.4 * s ) }px`;
}
Layout();
addEventListener( 'resize', Layout );

const Capitalize = ( text ) => text.charAt( 0 ).toUpperCase() + text.slice( 1 );

let move;
Clock.EverySecond( ( d ) =>
{
    const p = Clock.Parts( d );
    if ( hm.textContent !== p.hm )
        hm.textContent = p.hm;
    sec.textContent = Clock.seconds ? p.s : '';
    ampm.textContent = p.ampm;
    const line = Capitalize( p.date );
    if ( date.textContent !== line )
        date.textContent = line;
    if ( !move )
        move = Clock.Drift( box );
} );
