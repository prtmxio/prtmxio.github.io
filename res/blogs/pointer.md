# Building MNIST From Scratch — No Frameworks, Just NumPy

When you train a neural network using PyTorch or TensorFlow, it almost feels like magic. You define a model, call `.fit()`, and the loss starts to drop. But at some point, I wanted to know what’s really happening behind the scenes — what does *learning* actually mean? How does the network update its weights?  

So I decided to build everything from scratch — a simple neural network that classifies handwritten digits from the MNIST dataset, written entirely in **NumPy**, with no machine learning libraries, no `.backward()`, and no hidden autograd. Just pure math and matrix operations.

It was both frustrating and deeply satisfying.



At its core, the MNIST problem is simple: you get a 28×28 grayscale image of a digit (0–9), flatten it into a 784-dimensional vector, and feed it into a network that tries to guess the number. I used a very minimal architecture:

$$
\text{Input (784)} \rightarrow \text{Hidden (128)} \rightarrow \text{Output (10)}
$$

Each image passes through a hidden layer with a ReLU activation, then through an output layer with softmax to get a probability distribution over 10 digits. Nothing fancy — just enough to prove the concept.

The math for the forward pass is straightforward:

$$
z^{[l]} = W^{[l]} a^{[l-1]} + b^{[l]}, \quad a^{[l]} = \sigma(z^{[l]})
$$

For the first hidden layer, $\sigma$ is ReLU, and for the output, it’s softmax.  
The softmax gives us probabilities for each digit, while keeping the sum equal to 1.



To train the network, I used **cross-entropy loss**, which measures how far the predicted probabilities are from the true labels:

$$
L = -\frac{1}{N} \sum_i \sum_{k=1}^{10} y_{ik} \log(\hat{y}_{ik})
$$

If the model predicts correctly, $y$ and $\hat{y}$ align and $L$ becomes small. Otherwise, it grows.  
This simple function drives the entire learning process.



Backpropagation is where the real magic happens. Once the forward pass computes outputs, the backward pass figures out *how wrong* each neuron was, and adjusts its weights accordingly.  

For the output layer, the error term is:

$$
\delta^{[2]} = \hat{y} - y
$$

and for the hidden layer:

$$
\delta^{[1]} = (W^{[2]})^T \delta^{[2]} \odot \text{ReLU}'(z^{[1]})
$$

These $\delta$ terms are then used to compute gradients:

$$
\frac{\partial L}{\partial W^{[l]}} = \frac{1}{N} \delta^{[l]} (a^{[l-1]})^T, \quad
\frac{\partial L}{\partial b^{[l]}} = \frac{1}{N} \sum_i \delta^{[l]}_i
$$

Finally, all parameters get updated using gradient descent:

$$
W^{[l]} = W^{[l]} - \eta \frac{\partial L}{\partial W^{[l]}}, \quad
b^{[l]} = b^{[l]} - \eta \frac{\partial L}{\partial b^{[l]}}
$$

and that’s literally how the network “learns”.



I coded everything by hand — ReLU, its derivative, softmax, forward pass, backward pass, and the update loop. 