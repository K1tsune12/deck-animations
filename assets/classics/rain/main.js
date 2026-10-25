// Digital Rain: columns of glyphs falling in green, heads glowing white.

// colour from the plugin's classic options (config.js), Matrix green by default
const COLOR = ( window.CLASSIC_CONFIG && window.CLASSIC_CONFIG.color ) || '#33ff33';
const FONT_SIZE = 20;
const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789Z:.=*+-<>¦';
const STEP_SEC = 0.05;

// the falling head: the trail colour mixed 80% towards white
const HEAD = ( () =>
{
    const n = parseInt( COLOR.slice( 1 ), 16 );
    const mix = c => Math.round( c + ( 255 - c ) * 0.8 );
    return `rgb(${ mix( n >> 16 ) }, ${ mix( ( n >> 8 ) & 255 ) }, ${ mix( n & 255 ) })`;
} )();

const view = CreateCanvas();
let columns = [];
let since = 0;

view.onResize = () =>
{
    columns = Array.from( { length: Math.ceil( view.width / FONT_SIZE ) }, () => ( {
        y: Rand( -view.height / FONT_SIZE, 0 ),
        speed: Rand( 0.5, 1.2 ),
    } ) );
    view.ctx.fillStyle = 'black';
    view.ctx.fillRect( 0, 0, view.width, view.height );
};
view.onResize();

RunLoop( dt =>
{
    since += dt;
    if ( since < STEP_SEC )
        return;
    since = 0;

    const { ctx } = view;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.fillRect( 0, 0, view.width, view.height );
    ctx.font = `${ FONT_SIZE }px monospace`;
    ctx.textBaseline = 'top';

    columns.forEach( ( col, i ) =>
    {
        const row = Math.floor( col.y );
        const x = i * FONT_SIZE;
        // re-draw the previous head in the trail colour, then the new head bright
        ctx.fillStyle = COLOR;
        ctx.fillText( GLYPHS[ RandInt( GLYPHS.length ) ], x, ( row - 1 ) * FONT_SIZE );
        ctx.fillStyle = HEAD;
        ctx.fillText( GLYPHS[ RandInt( GLYPHS.length ) ], x, row * FONT_SIZE );

        col.y += col.speed;
        if ( row * FONT_SIZE > view.height && Math.random() > 0.975 )
        {
            col.y = 0;
            col.speed = Rand( 0.5, 1.2 );
        }
    } );
} );
