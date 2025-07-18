import * as vscode from 'vscode';
import logger from './logger';
import Configuration from './configuration';
import { stockProvider } from './provider';
import { render, renderFutures, stopAllRender } from './render';
import Stock from './stock';
import FutureHandler from './futures';
import { clearInterval } from 'timers';

function loadChoiceStocks() {
	return Configuration.getStocks().map((v) => {
		if (typeof v === 'string') {
			return new Stock(v);
		}
		if (typeof v === 'object') {
			return new Stock(v.code, v.alias, v.hold_price, v.hold_number);
		}
		throw new Error(
			'配置格式错误, 查看 https://github.com/Chef5/stock-bar#配置',
		);
	});
}

let timer = null;
let stocks: Stock[];

function restart() {
	const interval = Configuration.getUpdateInterval();
	if (timer) {
		clearInterval(timer);
		timer = null;
	}
	stocks = loadChoiceStocks();
	futureHandler.updateConfig(Configuration.getFutures());

	timer = setInterval(ticker, interval);
	ticker();
}

const futureHandler = new FutureHandler();

async function ticker() {
	try {
		// 从云端获取最新状态
		logger.debug('call fetchData');
		const [data] = await Promise.all([
			stockProvider.fetch(stocks.map((v) => v.code)),
			futureHandler.updateData(),
		]);
		// 更新本地的数据
		for (const origin of data) {
			const stock = stocks.find((v) => v.code.toLowerCase() === origin.code);
			if (!stock) {
				continue;
			}
			stock.update(origin);
		}
		// 渲染内容
		logger.debug('render');
		render(stocks);
		renderFutures(futureHandler.futures);
	} catch (e) {
		logger.error('%O', e);
	}
}

function stop() {
	if (timer) {
		clearInterval(timer);
		timer = null;
	}
	stopAllRender();
}

export function activate(context: vscode.ExtensionContext) {
	stocks = loadChoiceStocks();

	const startCmd = vscode.commands.registerCommand('stockbar.start', restart);
	const stopCmd = vscode.commands.registerCommand('stockbar.stop', stop);

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(() => {
			if (timer) {
				restart();
			}
		}),
	);
	context.subscriptions.push(startCmd);
	context.subscriptions.push(stopCmd);
	restart(); // 初始默认打开
}

export function deactivate() {
	return;
}
