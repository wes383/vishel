import { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
    children: ReactNode
}

interface State {
    hasError: boolean
    error: Error | null
    errorInfo: ErrorInfo | null
}

class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props)
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null
        }
    }

    static getDerivedStateFromError(error: Error): State {
        return {
            hasError: true,
            error,
            errorInfo: null
        }
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo)
        this.setState({
            error,
            errorInfo
        })
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="h-screen bg-neutral-900 text-white flex items-center justify-center p-8">
                    <div className="max-w-2xl">
                        <h1 className="text-3xl font-bold mb-4 text-red-500">Something went wrong</h1>
                        <div className="bg-neutral-800 rounded-lg p-6 mb-4">
                            <h2 className="text-xl font-semibold mb-2">Error:</h2>
                            <pre className="text-sm text-red-400 whitespace-pre-wrap break-words">
                                {this.state.error?.toString()}
                            </pre>
                        </div>
                        {this.state.errorInfo && (
                            <div className="bg-neutral-800 rounded-lg p-6 mb-4">
                                <h2 className="text-xl font-semibold mb-2">Stack Trace:</h2>
                                <pre className="text-xs text-gray-400 whitespace-pre-wrap break-words overflow-auto max-h-96">
                                    {this.state.errorInfo.componentStack}
                                </pre>
                            </div>
                        )}
                        <button
                            onClick={() => window.location.reload()}
                            className="bg-white text-black px-6 py-3 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                        >
                            Reload Application
                        </button>
                    </div>
                </div>
            )
        }

        return this.props.children
    }
}

export default ErrorBoundary
