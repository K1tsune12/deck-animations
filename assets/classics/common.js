// Shared bits for the generated "classic" screensavers: a full-screen canvas
// sized for the device pixel ratio, and a frame loop with a clamped dt.

const MAX_STEP_SEC = 0.1;

function CreateCanvas()
{
    const canvas = document.createElement( 'canvas' );
    document.body.appendChild( canvas );
    const ctx = canvas.getContext( '2d' );
    const view = { canvas, ctx, width: 0, height: 0, onResize: null };

    const Resize = () =>
    {
        const dpr = window.devicePixelRatio || 1;
        view.width = window.innerWidth;
        view.height = window.innerHeight;
        canvas.width = Math.round( view.width * dpr );
        canvas.height = Math.round( view.height * dpr );
        ctx.setTransform( dpr, 0, 0, dpr, 0, 0 );
        view.onResize && view.onResize();
    };
    window.addEventListener( 'resize', Resize );
    Resize();
    return view;
}

function RunLoop( step )
{
    let last;
    const Frame = ( now ) =>
    {
        requestAnimationFrame( Frame );
        const dt = last === undefined ? 0 : Math.min( ( now - last ) / 1000, MAX_STEP_SEC );
        last = now;
        step( dt, now / 1000 );
    };
    requestAnimationFrame( Frame );
}

function Rand( min, max )
{
    return min + Math.random() * ( max - min );
}

function RandInt( max )
{
    return Math.floor( Math.random() * max );
}
