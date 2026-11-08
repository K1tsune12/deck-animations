// A digital clock laid over an OLED art screensaver (option "clock" of the
// art). Same options as the clocks (font, size, seconds, date, brightness,
// movement); its colour is "clockColor" or, unset, the art's main colour.
// Wrapped so its names never clash with the art's own script, which shares
// this page.

( () =>
{
    const box = Clock.Box();
    box.style.color = Clock.cfg.clockColor || Clock.color( '#ffffff' );
    box.style.textShadow = '0 0 12px rgba(0, 0, 0, 0.9)';

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

    // a notch smaller than the standalone digital clock: the art is the point
    function Layout()
    {
        const s = Clock.scale * 0.7;
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

    let placed = false;
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
        if ( !placed )
        {
            placed = true;
            Clock.Drift( box );
        }
    } );
} )();
