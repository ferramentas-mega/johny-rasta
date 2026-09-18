/**
 * Plugin WordPress gerado por site.
 *
 * Por que um plugin, e não "cole no header.php": o tema recebe atualização e
 * a edição some; o plugin fica. E é o único jeito de dar ao operador do
 * WordPress uma tela própria — Site ID, endpoint, diagnóstico — sem pedir
 * que ele leia HTML.
 *
 * O que ele faz, e só isso:
 *  - enfileira o `t.js` UMA vez, no front (nunca no wp-admin), com `async`;
 *  - guarda Site ID e endpoint em `options`, editáveis numa tela em
 *    Configurações › Painel de Sites;
 *  - mostra um diagnóstico LOCAL (o que está configurado e onde a tag entra).
 *
 * O que ele NÃO faz: chamada de rede a partir do PHP (nada de "testar
 * conexão" pelo servidor — a verificação é evento recebido, pelo painel), e
 * nenhum segredo: Site ID e endpoint são os mesmos dados públicos do snippet.
 *
 * Os valores entram por `json_encode`/`esc_*` do lado do PHP; aqui só se
 * garante que o texto embutido é literal e sem quebra.
 */
function literal(v: string): string {
  return v.replace(/[\\'"\r\n]/g, '');
}

export function pluginWordpress(opcoes: { endpoint: string; publicId: string; dominio: string }): string {
  const endpoint = literal(opcoes.endpoint);
  const site = literal(opcoes.publicId);
  const dominio = literal(opcoes.dominio);
  return `<?php
/**
 * Plugin Name: Painel de Sites — Rastreamento
 * Description: Instala o coletor do Painel de Sites (t.js) em todas as páginas do site ${dominio}, uma vez só, sem editar o tema.
 * Version: 1.0.0
 * Author: Painel de Sites
 * License: GPL-2.0-or-later
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

define( 'PAINEL_SITES_ENDPOINT_PADRAO', '${endpoint}' );
define( 'PAINEL_SITES_ID_PADRAO', '${site}' );

function painel_sites_opcoes() {
    return array(
        'site_id'  => get_option( 'painel_sites_id', PAINEL_SITES_ID_PADRAO ),
        'endpoint' => rtrim( get_option( 'painel_sites_endpoint', PAINEL_SITES_ENDPOINT_PADRAO ), '/' ),
    );
}

/**
 * Enfileira o coletor no FRONT, nunca no painel administrativo: o wp-admin
 * não é visita do cliente, e contá-lo inflaria as sessões.
 */
function painel_sites_enfileirar() {
    if ( is_admin() ) {
        return;
    }
    $o = painel_sites_opcoes();
    if ( '' === $o['site_id'] ) {
        return;
    }
    wp_enqueue_script( 'painel-sites-t', $o['endpoint'] . '/t.js', array(), null, false );
}
add_action( 'wp_enqueue_scripts', 'painel_sites_enfileirar' );

/** \`async\` e \`data-site\` na tag — o coletor lê o identificador do próprio <script>. */
function painel_sites_atributos( $tag, $handle ) {
    if ( 'painel-sites-t' !== $handle ) {
        return $tag;
    }
    $o = painel_sites_opcoes();
    return str_replace( ' src=', ' async data-site="' . esc_attr( $o['site_id'] ) . '" src=', $tag );
}
add_filter( 'script_loader_tag', 'painel_sites_atributos', 10, 2 );

/** Tela em Configurações › Painel de Sites. */
function painel_sites_menu() {
    add_options_page( 'Painel de Sites', 'Painel de Sites', 'manage_options', 'painel-sites', 'painel_sites_tela' );
}
add_action( 'admin_menu', 'painel_sites_menu' );

function painel_sites_registrar() {
    register_setting( 'painel_sites', 'painel_sites_id', array( 'sanitize_callback' => 'sanitize_text_field' ) );
    register_setting( 'painel_sites', 'painel_sites_endpoint', array( 'sanitize_callback' => 'esc_url_raw' ) );
}
add_action( 'admin_init', 'painel_sites_registrar' );

function painel_sites_tela() {
    if ( ! current_user_can( 'manage_options' ) ) {
        return;
    }
    $o = painel_sites_opcoes();
    ?>
    <div class="wrap">
        <h1>Painel de Sites — Rastreamento</h1>
        <form method="post" action="options.php">
            <?php settings_fields( 'painel_sites' ); ?>
            <table class="form-table">
                <tr>
                    <th scope="row"><label for="painel_sites_id">Site ID</label></th>
                    <td><input type="text" id="painel_sites_id" name="painel_sites_id" class="regular-text" value="<?php echo esc_attr( $o['site_id'] ); ?>"></td>
                </tr>
                <tr>
                    <th scope="row"><label for="painel_sites_endpoint">Endpoint do painel</label></th>
                    <td><input type="url" id="painel_sites_endpoint" name="painel_sites_endpoint" class="regular-text" value="<?php echo esc_attr( $o['endpoint'] ); ?>"></td>
                </tr>
            </table>
            <?php submit_button(); ?>
        </form>
        <h2>Diagnóstico</h2>
        <p>Tag que o plugin insere no <code>&lt;head&gt;</code> de todas as páginas públicas (nunca no wp-admin):</p>
        <pre><code>&lt;script async src="<?php echo esc_html( $o['endpoint'] ); ?>/t.js" data-site="<?php echo esc_html( $o['site_id'] ); ?>"&gt;&lt;/script&gt;</code></pre>
        <p>
            <strong>Este plugin não confirma a instalação.</strong> Quem confirma é o painel, ao receber um evento real
            deste site. Depois de salvar, limpe o cache (do site e do plugin de cache, se houver), abra o site pelo
            link de diagnóstico do painel e conclua a verificação lá.
        </p>
        <p>Se o tema ou outro plugin já insere o mesmo <code>t.js</code>, remova uma das duas cópias: instalado duas vezes, o coletor conta uma só — mas a duplicidade é manutenção esquecida.</p>
    </div>
    <?php
}
`;
}
