#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use eframe::egui::{self, Color32, RichText, ViewportBuilder};
use serde::Deserialize;
use std::{
    net::TcpListener,
    sync::mpsc::{self, Receiver, Sender},
    thread,
};
use tungstenite::accept;

const ADDRESS: &str = "127.0.0.1:17863";

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum OverlayCommand {
    Caption {
        source: String,
        target: String,
        direction: String,
        font_size: f32,
        show_source: bool,
    },
    Status {
        live: bool,
    },
}

struct SubtitleOverlay {
    receiver: Receiver<OverlayCommand>,
    source: String,
    target: String,
    direction: String,
    font_size: f32,
    show_source: bool,
    live: bool,
    connected: bool,
}

impl SubtitleOverlay {
    fn new(receiver: Receiver<OverlayCommand>) -> Self {
        Self {
            receiver,
            source: "Waiting for speech…".into(),
            target: "Start the operator console to begin".into(),
            direction: "EN → DA".into(),
            font_size: 48.0,
            show_source: true,
            live: false,
            connected: false,
        }
    }

    fn receive_updates(&mut self) {
        while let Ok(command) = self.receiver.try_recv() {
            self.connected = true;
            match command {
                OverlayCommand::Caption {
                    source,
                    target,
                    direction,
                    font_size,
                    show_source,
                } => {
                    self.source = source;
                    self.target = target;
                    self.direction = direction;
                    self.font_size = font_size.clamp(28.0, 78.0);
                    self.show_source = show_source;
                }
                OverlayCommand::Status { live } => self.live = live,
            }
        }
    }
}

impl eframe::App for SubtitleOverlay {
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        self.receive_updates();
        let context = ui.ctx().clone();
        context.request_repaint_after(std::time::Duration::from_millis(100));

        egui::Frame::new()
            .fill(Color32::from_rgba_premultiplied(4, 8, 7, 242))
            .corner_radius(12.0)
            .inner_margin(14.0)
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    let drag = ui.add(
                        egui::Label::new(
                            RichText::new(if self.live {
                                "●  IBG · LIVE"
                            } else {
                                "●  IBG · READY"
                            })
                            .color(if self.live {
                                Color32::from_rgb(67, 220, 173)
                            } else {
                                Color32::from_rgb(145, 164, 158)
                            })
                            .size(12.0)
                            .strong(),
                        )
                        .sense(egui::Sense::drag()),
                    );
                    if drag.drag_started() {
                        context.send_viewport_cmd(egui::ViewportCommand::StartDrag);
                    }
                    ui.separator();
                    ui.label(
                        RichText::new(&self.direction)
                            .color(Color32::from_rgb(115, 216, 187))
                            .size(12.0)
                            .strong(),
                    );
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if ui.button(RichText::new("×").size(16.0)).clicked() {
                            context.send_viewport_cmd(egui::ViewportCommand::Close);
                        }
                        ui.label(
                            RichText::new(if self.connected {
                                "Console connected"
                            } else {
                                "Waiting for console"
                            })
                            .color(Color32::from_gray(155))
                            .size(11.0),
                        );
                    });
                });
                ui.add_space(8.0);
                if self.show_source {
                    ui.vertical_centered(|ui| {
                        ui.label(
                            RichText::new(&self.source)
                                .color(Color32::from_rgb(188, 201, 197))
                                .size((self.font_size * 0.52).max(18.0)),
                        );
                    });
                    ui.add_space(4.0);
                }
                ui.vertical_centered(|ui| {
                    ui.label(
                        RichText::new(&self.target)
                            .color(Color32::WHITE)
                            .size(self.font_size)
                            .strong(),
                    );
                });
            });
    }

    fn clear_color(&self, _visuals: &egui::Visuals) -> [f32; 4] {
        [0.0, 0.0, 0.0, 0.0]
    }
}

fn websocket_server(sender: Sender<OverlayCommand>) {
    let listener = match TcpListener::bind(ADDRESS) {
        Ok(listener) => listener,
        Err(error) => {
            eprintln!("Could not start overlay connection on {ADDRESS}: {error}");
            return;
        }
    };
    for stream in listener.incoming().flatten() {
        let sender = sender.clone();
        thread::spawn(move || {
            let Ok(mut socket) = accept(stream) else {
                return;
            };
            while let Ok(message) = socket.read() {
                let Ok(text) = message.to_text() else {
                    continue;
                };
                if let Ok(command) = serde_json::from_str::<OverlayCommand>(text) {
                    if sender.send(command).is_err() {
                        break;
                    }
                }
            }
        });
    }
}

fn main() -> eframe::Result {
    let (sender, receiver) = mpsc::channel();
    thread::spawn(move || websocket_server(sender));
    let options = eframe::NativeOptions {
        viewport: ViewportBuilder::default()
            .with_title("IBG Live Subtitles")
            .with_inner_size([980.0, 230.0])
            .with_min_inner_size([500.0, 150.0])
            .with_always_on_top()
            .with_decorations(false)
            .with_transparent(true),
        renderer: eframe::Renderer::Glow,
        ..Default::default()
    };
    eframe::run_native(
        "IBG Live Subtitles",
        options,
        Box::new(move |_creation_context| Ok(Box::new(SubtitleOverlay::new(receiver)))),
    )
}
