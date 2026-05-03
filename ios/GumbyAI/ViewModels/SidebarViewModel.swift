import SwiftUI

@MainActor
class SidebarViewModel: ObservableObject {
    @Published var isOpen = false
    
    func toggle() {
        withAnimation(.easeInOut(duration: 0.3)) {
            isOpen.toggle()
        }
    }
    
    func close() {
        withAnimation(.easeInOut(duration: 0.3)) {
            isOpen = false
        }
    }
    
    func open() {
        withAnimation(.easeInOut(duration: 0.3)) {
            isOpen = true
        }
    }
}
